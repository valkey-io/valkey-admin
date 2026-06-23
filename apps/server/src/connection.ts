import { GlideClient, GlideClusterClient, InfoOptions, ServerCredentials, ServiceType } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "valkey-common"
import { buildConnectionId, isValidDatabaseIndex, sanitizeUrl, toNodeId } from "valkey-common"
import { KeyEvictionPolicy } from "common/dist"
import { 
  getExistingClusterClient, 
  getClusterSlotStatsEnabled, 
  getKeyEvictionPolicy, 
  getServerVersion,
  parseInfo, 
  resolveHostnameOrIpAddress,
  supportsClusterDb } from "./utils"
import { checkJsonModuleAvailability } from "./check-json-module"
import { type ConnectionDetails } from "./actions/connection"
import { 
  ClusterRegistry, 
  isWebMode, 
  MetricsServerMap, 
  startMetricsServer, 
  clusterCredentials, 
  reconcileClusterMetricsServers, 
  isKubernetes, 
  ClusterNodeMap } from "./metrics-orchestrator"
import { subscribe } from "./node-watchers"
import { createClusterValkeyClient, createStandaloneValkeyClient } from "./valkey-client"

export type ConnectionContext = {
  clients: Map<string, { client: GlideClient | GlideClusterClient; clusterId?: string }>
  connectedNodesByCluster: Map<string, string[]>
  clusterNodesRegistry: ClusterRegistry
  metricsServerMap: MetricsServerMap
}

type ClusterCommit = {
  clusterClient: GlideClusterClient
  clusterId: string
  connectionId: string
  seedAddress: { host: string; port: number }
  discoveredClusterNodes: ClusterNodeMap
}

type StandaloneConnectionDetails = {
  keyEvictionPolicy: KeyEvictionPolicy
  jsonModuleAvailable: boolean
}

type ClusterConnectionDetails = StandaloneConnectionDetails & {
  clusterId: string
  clusterSlotStatsEnabled: boolean
}

type StandaloneConnectFulfilledPayload = {
  connectionId: string
  connectionDetails: StandaloneConnectionDetails
}

type ClusterConnectFulfilledPayload = {
  connectionId: string
  address: { host: string; port: number }
  connectionDetails: ClusterConnectionDetails
}

// Dedup concurrent cluster-client creations by clusterId.
const inFlightClusterClients = new Map<string, Promise<GlideClusterClient>>()

// Test-only: reset in-flight state between cases.
export const _resetInFlightClusterClients = () => inFlightClusterClients.clear()

/**
 * Default Valkey/Redis `databases` count when the server's `CONFIG GET databases`
 * response is missing or unparseable. Mirrors the upstream default (16).
 */
const DEFAULT_DATABASES_COUNT = 16

/**
 * Read the connected standalone server's configured `databases` count via
 * `CONFIG GET databases`. Returns the parsed integer when present and parseable;
 * otherwise returns the upstream default of 16.
 */
async function getDatabasesCount(client: GlideClient): Promise<number> {
  try {
    const raw = (await client.configGet(["databases"]))?.["databases"]
    const parsed = raw !== undefined ? Number.parseInt(String(raw), 10) : NaN
    if (Number.isInteger(parsed) && parsed >= 1) return parsed
  } catch (err) {
    console.warn("Unable to read `databases` from CONFIG GET; defaulting to 16:", err)
  }
  return DEFAULT_DATABASES_COUNT
}

/**
 * Typed error used to short-circuit `connectToValkeyLocked` for Database_Index
 * configuration problems (invalid shape, out of range, cluster gating). The
 * existing catch block in the locked function performs the cleanup
 * (close standaloneClient, drop the Client_Map entry, send `connectRejected`),
 * so callers throw this to preserve those invariants.
 */
class ConnectionRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ConnectionRejectedError"
  }
}

// Per-connectionId mutex around the entire connectToValkey body. The second connector enters
// only after the first has fully committed (or failed), at which point the
// getExistingConnection path below reuses the committed
// entry (standalone or cluster).
const connectInFlight = new Map<string, Promise<GlideClient | GlideClusterClient | undefined>>()

export const _resetConnectInFlight = () => connectInFlight.clear()

export async function connectToValkey(
  ctx: ConnectionContext,
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string
    isRetry?: boolean
  },
) {
  const { connectionId } = payload
  const priorConnect = connectInFlight.get(connectionId) ?? Promise.resolve()
  // .catch swallows the prior connect's failure so our turn still runs.
  const currentConnect = priorConnect.catch(() => {}).then(() =>
    connectToValkeyLocked(ctx, ws, payload),
  )
  connectInFlight.set(connectionId, currentConnect)
  try {
    return await currentConnect
  } finally {
    if (connectInFlight.get(connectionId) === currentConnect) {
      connectInFlight.delete(connectionId)
    }
  }
}

async function connectToValkeyLocked(
  ctx: ConnectionContext,
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string
    isRetry?: boolean
  },
) {
  const { clients, clusterNodesRegistry, metricsServerMap } = ctx

  const {
    host, port, username, password, tls: useTLS,
    verifyTlsCertificate, authType, awsRegion, awsReplicationGroupId,
  } = payload.connectionDetails

  const db = payload.connectionDetails.db

  const { connectionId } = payload
  const addresses = [
    {
      host,
      port: Number(port),
    },
  ]
  const credentials: ServerCredentials | undefined =
    authType === "iam"
      ? {
        username: username!,
        iamConfig: {
          clusterName: awsReplicationGroupId!,
          service: ServiceType.Elasticache,
          region: awsRegion!,
        },
      }
      : password ? { username, password } : undefined

  let standaloneClient: GlideClient | undefined

  try {
    if (!isValidDatabaseIndex(db)) {
      throw new ConnectionRejectedError(
        "Invalid Database_Index: must be a non-negative integer",
      )
    }

    // If retrying, we need to close stale client
    if (payload.isRetry) {
      const existing = clients.get(connectionId)
      // Only close standalone clients here. Cluster clients are shared across
      // slots; let updateClusterNodesClient handle the close + repoint atomically.
      if (existing && existing.client instanceof GlideClient) {
        try { existing.client.close() } catch (error) {
          console.log(`Error closing stale client for ${connectionId}:`, error)
        }
      }
      clients.delete(connectionId)
    }

    const existingConnection = await getExistingConnection(payload, clients)
    if (existingConnection) {
      if (existingConnection.clusterId) {
        const clusterClient = existingConnection.client as GlideClusterClient
        const { clusterId } = existingConnection
        const discoveredClusterNodes =
          clusterNodesRegistry[clusterId] ??
          (await discoverCluster(clusterClient, payload)).discoveredClusterNodes
        return commitClusterConnection(ctx, ws, {
          clusterClient,
          clusterId,
          connectionId,
          seedAddress: addresses[0],
          discoveredClusterNodes,
        })
      }
      const existingStandalone = existingConnection.client as GlideClient
      const [keyEvictionPolicy, jsonModuleAvailable] = await Promise.all([
        getKeyEvictionPolicy(existingStandalone),
        checkJsonModuleAvailability(existingStandalone),
      ])
      sendStandaloneConnectFulfilled(ws, {
        connectionId,
        connectionDetails: { keyEvictionPolicy, jsonModuleAvailable },
      })
      subscribe(connectionId, ws)
      return existingStandalone
    }
    
    standaloneClient = await createStandaloneValkeyClient({
      addresses,
      credentials,
      useTLS,
      verifyTlsCertificate,
    })

    // Open the registration gate: the metrics process spawned below will POST
    // /register back to the orchestrator and the handler checks clients.has(connectionId).
    // The finally block below ensures we close this gate on every exit path.
    clients.set(connectionId, { client: standaloneClient })

    // Detect cluster mode and Server_Version on the probe BEFORE issuing any
    // `SELECT`. This is required for cluster gating: cluster nodes reject
    // `SELECT N` for any N (even 0), so we cannot bind the probe to a `db`
    // without losing the chance to surface a friendly version-gating error.
    const isCluster = await belongsToCluster(standaloneClient)
    const serverVersion = isCluster ? await getServerVersion(standaloneClient) : null

    if (isCluster) {
      let shouldCloseClusterClientOnError
      let ownInflight: Promise<GlideClusterClient> | undefined

      // Cluster gating: cluster mode honors a non-zero Database_Index only on
      // Valkey/Redis Server_Version >= 9.0.0. Detect the version
      // on the discovery client before tearing it down.
      const clusterDbSupported = supportsClusterDb(serverVersion)
      if (!clusterDbSupported && db > 0) {
        const versionLabel = serverVersion
          ? `${serverVersion.major}.${serverVersion.minor}.${serverVersion.patch}`
          : "unknown"
        throw new ConnectionRejectedError(
          `Cluster server version ${versionLabel} does not support a non-zero Database_Index`,
        )
      }
      const clusterDatabaseId = clusterDbSupported ? db : 0

      const { discoveredClusterNodes, clusterId } = await discoverCluster(standaloneClient, payload)
      standaloneClient.close()

      const existingClusterConnection = await getExistingClusterClient(discoveredClusterNodes, clients)
      let clusterClient: GlideClusterClient
      if (existingClusterConnection && !payload.isRetry) {
        clusterClient = existingClusterConnection.client
        shouldCloseClusterClientOnError = false
      } else {
        const inflight = inFlightClusterClients.get(clusterId)
        if (inflight) {
          clusterClient = await inflight
          shouldCloseClusterClientOnError = false
        } else {
          ownInflight = createClusterValkeyClient({
            addresses,
            credentials,
            useTLS,
            verifyTlsCertificate,
            databaseId: clusterDatabaseId,
          })
          inFlightClusterClients.set(clusterId, ownInflight)
          try {
            clusterClient = await ownInflight
            shouldCloseClusterClientOnError = true
          } catch (err) {
            // Surface failure to siblings awaiting our promise and clear the slot
            // so the next connector can retry instead of inheriting a permanent reject.
            inFlightClusterClients.delete(clusterId)
            throw err
          }
        }
      }

      try {
        clusterCredentials.set(clusterId, payload.connectionDetails.password)
        clusterNodesRegistry[clusterId] = discoveredClusterNodes

        if (isWebMode) {
          reconcileClusterMetricsServers(clusterNodesRegistry, metricsServerMap, payload.connectionDetails)
        }

        await commitClusterConnection(ctx, ws, {
          clusterClient,
          clusterId,
          connectionId,
          seedAddress: addresses[0],
          discoveredClusterNodes,
        })

        if (payload.isRetry && existingClusterConnection) {
          updateClusterNodesClient(clients, existingClusterConnection, clusterClient)
        }

        shouldCloseClusterClientOnError = false
        return clusterClient
      } finally {
        if (ownInflight && inFlightClusterClients.get(clusterId) === ownInflight) {
          inFlightClusterClients.delete(clusterId)
        }
        if (shouldCloseClusterClientOnError) {
          try {
            clusterClient.close()
          } catch (err) {
            console.error(`Error closing uncommitted cluster client for ${connectionId}:`, err)
          }
        }
      }
    }

    // Standalone path. Issue `SELECT` against the configured database AFTER
    // we know the server is standalone (cluster mode rejects `SELECT`). For
    // db > 0 we need to rebuild the client so Glide binds the connection to
    // the requested database.
    if (db > 0) {
      const previousProbe = standaloneClient
      // Detach the probe from the registry first so the catch block doesn't
      // double-close it if recreation fails below.
      if (clients.get(connectionId)?.client === previousProbe) {
        clients.delete(connectionId)
      }
      try { previousProbe.close() } catch (err) {
        console.error(`Error closing standalone probe for ${connectionId}:`, err)
      }
      standaloneClient = await createStandaloneValkeyClient({
        addresses,
        credentials,
        useTLS,
        verifyTlsCertificate,
        databaseId: db,
      })
      clients.set(connectionId, { client: standaloneClient })
    }

    // Range-check the supplied Database_Index against the server's configured
    // `databases` count. Done after the client is connected
    // because only the live server knows its `databases` value (different
    // nodes can be configured differently).
    const databasesCount = await getDatabasesCount(standaloneClient)
    if (db >= databasesCount) {
      throw new ConnectionRejectedError(
        `Database_Index ${db} is out of range (server allows 0..${databasesCount - 1})`,
      )
    }

    // In K8s or Web, metrics servers register themselves.
    if (!isKubernetes) {
      // `metricsServerMap` is keyed by node-id, not Connection_Identifier.
      // Strip the `-db<N>` suffix so a second user connection on a different
      // db reuses the existing metrics process for the same node (N:1).
      const metricsNodeId = toNodeId(payload.connectionId)
      if (!metricsServerMap.has(metricsNodeId)) {
        await startMetricsServer(payload.connectionDetails, metricsNodeId)
      }
    }

    console.log("Connected to standalone")

    subscribe(payload.connectionId, ws)

    const [keyEvictionPolicy, jsonModuleAvailable] = await Promise.all([
      getKeyEvictionPolicy(standaloneClient),
      checkJsonModuleAvailability(standaloneClient),
    ])
    sendStandaloneConnectFulfilled(ws, {
      connectionId,
      connectionDetails: { keyEvictionPolicy, jsonModuleAvailable },
    })

    return standaloneClient
    
  } catch (err) {
    if (standaloneClient) {
      try {
        standaloneClient.close()
      } catch (closeErr) {
        console.error(`Error closing discovery client for ${connectionId}:`, closeErr)
      }

      if (clients.get(connectionId)?.client === standaloneClient) {
        clients.delete(connectionId)
      }
    }

    console.error("Error connecting to Valkey", err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          errorMessage,
          connectionId,
        },
      }),
    )
    return undefined
  }
}

export async function discoverTopology(
  ws: WebSocket,
  payload: { discoveryId: string; connectionDetails: ConnectionDetails },
): Promise<void> {
  const { discoveryId, connectionDetails } = payload
  const {
    host, port, username, password, tls: useTLS,
    verifyTlsCertificate, authType, awsRegion, awsReplicationGroupId,
  } = connectionDetails

  const addresses = [{ host, port: Number(port) }]
  const credentials: ServerCredentials | undefined =
    authType === "iam"
      ? {
        username: username!,
        iamConfig: {
          clusterName: awsReplicationGroupId!,
          service: ServiceType.Elasticache,
          region: awsRegion!,
        },
      }
      : password ? { username, password } : undefined

  let client: GlideClient | undefined
  try {
    // Cluster discovery is read-only `CLUSTER SLOTS` against the seed node;
    // database selection is irrelevant for cluster commands. Skip
    // `databaseId` entirely so Glide does not issue `SELECT` (cluster nodes
    // reject `SELECT` even for db 0).
    client = await createStandaloneValkeyClient({ addresses, credentials, useTLS, verifyTlsCertificate })
    const { discoveredClusterNodes } = await discoverCluster(client, { connectionDetails })
    if (Object.keys(discoveredClusterNodes).length < 1) {
      throw new Error("Unable to discover cluster")
    }
    ws.send(
      JSON.stringify({
        type: VALKEY.TOPOLOGY.discoveryEndpointFulfilled,
        payload: { discoveryId, clusterNodes: discoveredClusterNodes },
      }),
    )
  } catch (err) {
    console.error("Error discovering topology", err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    ws.send(
      JSON.stringify({
        type: VALKEY.TOPOLOGY.discoveryEndpointRejected,
        payload: { discoveryId, errorMessage },
      }),
    )
  } finally {
    client?.close()
  }
}

export async function belongsToCluster(client: GlideClient): Promise<boolean> {
  const response = await client.info([InfoOptions.Cluster])
  const parsed = parseInfo(response)
  return parsed["cluster_enabled"] === "1"
}

function updateClusterNodesClient(
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>, 
  existingClusterConnection: {client: GlideClient | GlideClusterClient, clusterId?: string},
  newClusterClient: GlideClusterClient,
) {
  const sharedIds = [...clients.entries()]
    .filter(([, entry]) => entry.client === existingClusterConnection.client)
    .map(([id]) => id)

  try { existingClusterConnection.client.close() } catch (error) {
    console.error(`Error closing stale client for ${existingClusterConnection.clusterId}:`, error)
  }
  // Update map with new client
  sharedIds.forEach((id) => clients.set(id, { client: newClusterClient!, clusterId: existingClusterConnection.clusterId }))
}

async function commitClusterConnection(
  ctx: ConnectionContext,
  ws: WebSocket,
  commit: ClusterCommit,
): Promise<GlideClusterClient> {
  const { clients, connectedNodesByCluster, clusterNodesRegistry } = ctx
  const { clusterClient, clusterId, connectionId, seedAddress, discoveredClusterNodes } = commit

  const [clusterSlotStatsEnabled, keyEvictionPolicy, jsonModuleAvailable] = await Promise.all([
    getClusterSlotStatsEnabled(clusterClient),
    getKeyEvictionPolicy(clusterClient),
    checkJsonModuleAvailability(clusterClient),
  ])

  clusterNodesRegistry[clusterId] = discoveredClusterNodes
  clients.set(connectionId, { client: clusterClient, clusterId })

  const nodes = connectedNodesByCluster.get(clusterId)
  if (nodes === undefined) connectedNodesByCluster.set(clusterId, [connectionId])
  else if (!nodes.includes(connectionId)) nodes.push(connectionId)

  subscribe(connectionId, ws)

  sendAddCluster(ws, clusterId, discoveredClusterNodes)
  sendClusterConnectFulfilled(ws, {
    connectionId,
    address: seedAddress,
    connectionDetails: {
      clusterId,
      keyEvictionPolicy,
      clusterSlotStatsEnabled,
      jsonModuleAvailable,
    },
  })

  return clusterClient
}

function sendStandaloneConnectFulfilled(ws: WebSocket, payload: StandaloneConnectFulfilledPayload) {
  ws.send(JSON.stringify({ type: VALKEY.CONNECTION.standaloneConnectFulfilled, payload }))
}

export async function discoverCluster(
  client: GlideClient | GlideClusterClient, 
  payload: { connectionDetails: ConnectionDetails, connectionId?: string;},
)  {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await client.customCommand(["CLUSTER", "SLOTS"]) as any[][]
    // First primary node's ID
    const clusterId = R.path([0, 2, 2], response)

    const discoveredClusterNodes = response.reduce((acc, slotRange) => {
      const [, , ...nodes] = slotRange
      const [primaryHost, primaryPort] = nodes[0]
      const primaryKey = sanitizeUrl(`${primaryHost}-${primaryPort}`)

      if (!acc[primaryKey]) {
        acc[primaryKey] = {
          host: primaryHost,
          port: primaryPort,
          username: payload.connectionDetails.username,
          ...(payload.connectionDetails.authType === "iam" && {
            authType: "iam" as const,
            awsRegion: payload.connectionDetails.awsRegion,
            awsReplicationGroupId: payload.connectionDetails.awsReplicationGroupId,
          }),
          tls: payload.connectionDetails.tls,
          verifyTlsCertificate: payload.connectionDetails.verifyTlsCertificate,
          replicas: [],
        }
      }
      // add replicas under their primary
      nodes.slice(1).forEach(([host, port, id]) => {
        const replica = { id, host, port }
        // avoid duplicates
        if (!acc[primaryKey].replicas.some((r) => r.id === id)) {
          acc[primaryKey].replicas.push(replica)
        }
      })

      if (Object.keys(acc).length < 1) {
        throw new Error("Unable to discover cluster")
      }

      return acc
    }, {} as Record<string, {
      host: string;
      port: number;
      username?: string,
      tls: boolean,
      verifyTlsCertificate: boolean,
      replicas: { id: string; host: string; port: number }[];
    }>)

    return { discoveredClusterNodes, clusterId }
  } catch (err) {
    console.error("Error discovering cluster:", err)
    throw new Error("Failed to discover cluster") 
  }
}

function sendAddCluster(
  ws: WebSocket,
  clusterId: string,
  clusterNodes: ClusterNodeMap,
) {
  ws.send(
    JSON.stringify({
      type: VALKEY.CLUSTER.addCluster,
      payload: { clusterId, clusterNodes },
    }),
  )
}

function sendClusterConnectFulfilled(ws: WebSocket, payload: ClusterConnectFulfilledPayload) {
  ws.send(JSON.stringify({ type: VALKEY.CONNECTION.clusterConnectFulfilled, payload }))
}

export async function getExistingConnection(
  payload:{connectionId: string, connectionDetails: ConnectionDetails, isRetry?: boolean}, 
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
) : Promise<{ client: GlideClient | GlideClusterClient; clusterId?: string | undefined; } | undefined>
{
  const { connectionId, connectionDetails, isRetry } = payload
  // If the frontend is retrying a broken connection, it's not a duplicate
  if (isRetry) {
    return undefined
  }

  const resolvedAddresses = (await resolveHostnameOrIpAddress(connectionDetails.host)).addresses
  // Prevent duplicate connections: 
  // 1) True if any resolved host:port:db is already connected
  // 2) Or if this connectionId already exists as a standalone connection

  if (clients.has(connectionId)) return clients.get(connectionId)

  const db = connectionDetails.db
  const existingConnectionId = resolvedAddresses
    .map((address) => buildConnectionId(address, connectionDetails.port, db))
    .find((key) => clients.has(key))

  return existingConnectionId ? clients.get(existingConnectionId) : undefined
}

export async function closeMetricsServer(
  connectionId: string,
  metricsServerMap: MetricsServerMap,
  clients: Map<string, { client: GlideClient | GlideClusterClient; clusterId?: string }>,
) {
  // Map Connection_Identifier → metrics-node-id at the boundary.
  const nodeId = toNodeId(connectionId)

  // N:1 invariant: many user-visible connections may share one metrics
  // process for the same (host, port). Only close when this is the LAST
  // sibling, otherwise we'd orphan still-active dbs on the same node.
  // The `id !== connectionId` guard tolerates callers that haven't yet
  // removed `connectionId` from `clients`; teardownConnection currently
  // removes first, so this is belt-and-suspenders.
  const stillReferenced = [...clients.keys()].some(
    (id) => id !== connectionId && toNodeId(id) === nodeId,
  )
  if (stillReferenced) return

  const metricsServerUri = metricsServerMap.get(nodeId)?.metricsURI
  if (metricsServerUri) {
    const res = await fetch(`${metricsServerUri}/connection/close`, 
      { method: "POST",
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ connectionId }), 
      })
    if (res.ok) {
      metricsServerMap.delete(nodeId)
      console.log(`Metrics server for ${nodeId} closed successfully`)
    }
    else console.warn("Could not kill metrics server process")
  }
}

export function teardownConnection(
  ctx: Omit<ConnectionContext, "connectedNodesByCluster">,
  connectionId: string,
) {
  const { clients, clusterNodesRegistry, metricsServerMap } = ctx

  // In web mode, metrics servers are managed by the orchestrator
  if (!isWebMode) {
    closeMetricsServer(connectionId, metricsServerMap, clients).catch((err) =>
      console.error(`Error closing metrics server for ${connectionId}:`, err),
    )
  }

  const connection = clients.get(connectionId)
  clients.delete(connectionId)

  if (connection && ![...clients.values()].some((c) => c.client === connection.client)) {
    try {
      connection.client.close()
    } catch (error) {
      console.error(`Error closing connection ${connectionId}:`, error)
    }

    if (connection.clusterId && !isWebMode) {
      delete clusterNodesRegistry[connection.clusterId]
      clusterCredentials.delete(connection.clusterId)
    }
  }
}
