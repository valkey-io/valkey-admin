import { GlideClient, GlideClusterClient, InfoOptions, ServerCredentials, ServiceType } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "valkey-common"
import { sanitizeUrl } from "valkey-common"
import { KeyEvictionPolicy } from "common/dist"
import { 
  getExistingClusterClient, 
  getClusterSlotStatsEnabled, 
  getKeyEvictionPolicy, 
  parseInfo, 
  resolveHostnameOrIpAddress } from "./utils"
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

// Dedup concurrent cluster-client creations by clusterId.
const inFlightClusterClients = new Map<string, Promise<GlideClusterClient>>()

// Test-only: reset in-flight state between cases.
export const _resetInFlightClusterClients = () => inFlightClusterClients.clear()

// Per-connectionId mutex around the entire connectToValkey body. The second connector enters
// only after the first has fully committed (or failed), at which point the
// getExistingConnection path below reuses the committed
// entry (standalone or cluster).
const connectInFlight = new Map<string, Promise<GlideClient | GlideClusterClient | undefined>>()

export const _resetConnectInFlight = () => connectInFlight.clear()

export async function connectToValkey(
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string
    isRetry?: boolean
  },
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string }>,
  connectedNodesByCluster: Map<string, string[]>,
  metricsServerMap: MetricsServerMap,
  clusterNodesRegistry: ClusterRegistry,
) {
  const { connectionId } = payload
  const priorConnect = connectInFlight.get(connectionId) ?? Promise.resolve()
  // .catch swallows the prior connect's failure so our turn still runs.
  const currentConnect = priorConnect.catch(() => {}).then(() =>
    connectToValkeyLocked(ws, payload, clients, connectedNodesByCluster, metricsServerMap, clusterNodesRegistry),
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
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string
    isRetry?: boolean
  },
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string }>,
  connectedNodesByCluster: Map<string, string[]>,
  metricsServerMap: MetricsServerMap,
  clusterNodesRegistry: ClusterRegistry,
) {
  
  const {
    host, port, username, password, tls: useTLS,
    verifyTlsCertificate, authType, awsRegion, awsReplicationGroupId,
  } = payload.connectionDetails
  
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

  try {
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
        return commitClusterConnection(
          ws, clusterClient, clusterId, connectionId, addresses[0],
          clients, connectedNodesByCluster, clusterNodesRegistry, discoveredClusterNodes,
        )
      }
      await sendStandaloneConnectFulfilled(existingConnection.client as GlideClient, connectionId, ws)
      subscribe(connectionId, ws)
      return existingConnection.client
    }
    
    const standaloneClient = await createStandaloneValkeyClient({
      addresses,
      credentials,
      useTLS,
      verifyTlsCertificate,
    })
    let shouldCloseStandaloneClientOnError = true

    try {
      // Open the registration gate: the metrics process spawned below will POST
      // /register back to the orchestrator and the handler checks clients.has(connectionId).
      // The finally block below ensures we close this gate on every exit path.
      clients.set(connectionId, { client: standaloneClient })

      // In K8s or Web, metrics servers register themselves.
      if (!isKubernetes && !metricsServerMap.has(payload.connectionId)) {
        await startMetricsServer(payload.connectionDetails, payload.connectionId)
      }
      
      if (await belongsToCluster(standaloneClient)) {
        let shouldCloseClusterClientOnError
        let ownInflight: Promise<GlideClusterClient> | undefined

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
            ownInflight = createClusterValkeyClient({ addresses, credentials, useTLS, verifyTlsCertificate })
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

          await commitClusterConnection(
            ws, clusterClient, clusterId, connectionId, addresses[0],
            clients, connectedNodesByCluster, clusterNodesRegistry, discoveredClusterNodes,
          )

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

      console.log("Connected to standalone")

      subscribe(payload.connectionId, ws)

      await sendStandaloneConnectFulfilled(standaloneClient, connectionId, ws)

      shouldCloseStandaloneClientOnError = false
      return standaloneClient

    } finally {
      if (shouldCloseStandaloneClientOnError) {
        try {
          standaloneClient.close()
        } catch (err) {
          console.error(`Error closing discovery client for ${connectionId}:`, err)
        }

        if (clients.get(connectionId)?.client === standaloneClient) {
          clients.delete(connectionId)
        }
      }
    }
  } catch (err) {
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
  ws: WebSocket,
  clusterClient: GlideClusterClient,
  clusterId: string,
  connectionId: string,
  seedAddress: { host: string; port: number },
  clients: Map<string, { client: GlideClient | GlideClusterClient; clusterId?: string }>,
  connectedNodesByCluster: Map<string, string[]>,
  clusterNodesRegistry: ClusterRegistry,
  discoveredClusterNodes: ClusterNodeMap,
): Promise<GlideClusterClient> {
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
  sendClusterConnectFulfilled(
    ws,
    connectionId,
    clusterId,
    keyEvictionPolicy,
    clusterSlotStatsEnabled,
    jsonModuleAvailable,
    seedAddress,
  )

  return clusterClient
}

async function sendStandaloneConnectFulfilled(client: GlideClient, connectionId: string, ws: WebSocket) {
  const keyEvictionPolicy = await getKeyEvictionPolicy(client)
  const jsonModuleAvailable = await checkJsonModuleAvailability(client)

  ws.send(
    JSON.stringify({
      type: VALKEY.CONNECTION.standaloneConnectFulfilled,
      payload: {
        connectionId,
        connectionDetails: {
          keyEvictionPolicy,
          jsonModuleAvailable,
        },
      },
    }),
  )
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

function sendClusterConnectFulfilled(
  ws: WebSocket,
  connectionId: string,
  clusterId: string,
  keyEvictionPolicy: KeyEvictionPolicy,
  clusterSlotStatsEnabled: boolean,
  jsonModuleAvailable: boolean,
  address: { host: string; port: number; },
) {
  ws.send(
    JSON.stringify({
      type: VALKEY.CONNECTION.clusterConnectFulfilled,
      payload: {
        connectionId,
        connectionDetails: {
          clusterId,
          keyEvictionPolicy,
          clusterSlotStatsEnabled,
          jsonModuleAvailable,
        },
        address,
      },
    }),
  )
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
  // 1) True if any resolved host:port is already connected
  // 2) Or if this connectionId already exists as a standalone connection

  if (clients.has(connectionId)) return clients.get(connectionId)
  
  const existingConnectionId = resolvedAddresses
    .map((address) => sanitizeUrl(`${address}:${connectionDetails.port}`))
    .find((key) => clients.has(key))

  return existingConnectionId ? clients.get(existingConnectionId) : undefined
}

export async function closeMetricsServer(connectionId: string, metricsServerMap: MetricsServerMap) {
  const metricsServerUri = metricsServerMap.get(connectionId)?.metricsURI
  if (metricsServerUri) {
    const res = await fetch(`${metricsServerUri}/connection/close`, 
      { method: "POST",
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ connectionId }), 
      })
    if (res.ok) {
      metricsServerMap.delete(connectionId)
      console.log(`Metrics server for ${connectionId} closed successfully`)
    }
    else console.warn("Could not kill metrics server process")
  }
}

export function teardownConnection(
  connectionId: string,
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
  metricsServerMap: MetricsServerMap,
  clusterNodesRegistry?: ClusterRegistry,
) {
  // In web mode, metrics servers are managed by the orchestrator
  if (!isWebMode) {
    closeMetricsServer(connectionId, metricsServerMap).catch((err) =>
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

    if (clusterNodesRegistry && connection.clusterId && !isWebMode) {
      delete clusterNodesRegistry[connection.clusterId]
      clusterCredentials.delete(connection.clusterId)
    }
  }
}
