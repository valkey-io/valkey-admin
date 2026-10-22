import { GlideClient, GlideClusterClient, InfoOptions, ServerCredentials, ServiceType } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "valkey-common"
import { buildConnectionId, isValidDatabaseIndex, sanitizeUrl, toNodeId, buildUrl } from "valkey-common"
import { mintGcpAccessToken, registerGcpTokenRefresh, unregisterGcpTokenRefresh } from "valkey-common"
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
  isWebMode, 
  startMetricsServer, 
  reconcileClusterMetricsServers, 
  pruneOwnerCollectors,
  isKubernetes, 
  forgetCollectorKey,
  ClusterNodeMap,
  type NodeInfo } from "./metrics-orchestrator"
import { scopedId, subscribe } from "./node-watchers"
import { clearCpuSamples } from "./node-utilization"
import { createAuthProbeClient, createClusterValkeyClient, createStandaloneValkeyClient } from "./valkey-client"
import { withAuthLimit } from "./auth-limiter"
import { createOwnerState, type OwnerState } from "./owner"

/**
 * One owner's state plus the requesting socket's cluster bookkeeping. All
 * clients, topology and collectors here belong to the Valkey identity the
 * connection authenticates as.
 */
export type ConnectionContext = OwnerState & {
  connectedNodesByCluster: Map<string, string[]>
}

// Fill-in state for callers that pass only some maps (tests), keyed by their
// `clients` map so concurrent calls with the same maps share in-flight state.
const fillIns = new WeakMap<object, OwnerState>()

/**
 * Complete a partial context with the missing owner-state fields.
 */
export const toConnectionContext = (
  partial: Partial<OwnerState> & { connectedNodesByCluster?: Map<string, string[]> },
): ConnectionContext => {
  const anchor = partial.clients ?? partial
  let fill = fillIns.get(anchor)
  if (!fill) {
    fill = createOwnerState(partial.ownerKey ?? "password~default")
    fillIns.set(anchor, fill)
  }
  return { ...fill, connectedNodesByCluster: new Map(), ...partial }
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
  /**
   * Server-configured database count (`databases` / `cluster-databases`).
   * Omitted when the server's count could not be read (e.g. `CONFIG GET`
   * denied by ACL). Consumers must treat the absent case as "unknown" and
   * impose no range limit as substituting a default would cap the range at a
   * guess and reject databases the server actually has.
   */
  databasesCount?: number
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

// Concurrent cluster-client creations are deduplicated per owner by clusterId
// (OwnerState.inFlightClusterClients). Kept for the existing tests.
export const _resetInFlightClusterClients = () => {}

/**
 * Read the server's configured database count via `CONFIG GET`, trying each of
 * `configKeys` in order (cluster callers pass `["cluster-databases", "databases"]` as
 * Valkey 9 clusters expose the count as `cluster-databases`). Returns the first
 * parseable integer >= 1, or `null` when no key yields one (e.g. `CONFIG GET`
 * denied by ACL).
 */
async function getDatabasesCount(
  client: GlideClient | GlideClusterClient,
  configKeys: string[] = ["databases"],
): Promise<number | null> {
  for (const key of configKeys) {
    try {
      const response = await client.configGet([key])
      let raw = response?.[key]
      // Cluster configGet can return a per-node dict ({ nodeAddr: { key: value } })
      // when routed to multiple nodes; unwrap the first node's record.
      if (raw === undefined && response !== null && typeof response === "object") {
        const firstNode = Object.values(response)[0]
        if (firstNode !== null && typeof firstNode === "object") {
          raw = (firstNode as Record<string, unknown>)[key] as typeof raw
        }
      }
      const parsed = raw !== undefined ? Number.parseInt(String(raw), 10) : NaN
      if (Number.isInteger(parsed) && parsed >= 1) return parsed
    } catch (err) {
      console.warn(`Unable to read \`${key}\` from CONFIG GET:`, err)
    }
  }
  return null
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
// The map lives in the owner's state (OwnerState.connectInFlight). Kept for the existing tests.
export const _resetConnectInFlight = () => {}

/**
 * Prove that Valkey accepts `details`' credentials on this node: open a
 * short-lived client, then close it. Throws on rejection. Counted by the
 * failed-AUTH limit. Valkey Admin never stores or compares secrets.
 *
 * Every connect and discovery runs this first. The working clients use
 * static node discovery, which does not reject bad credentials at creation.
 */
async function verifyCredentials(
  details: ConnectionDetails,
  options: Parameters<typeof createAuthProbeClient>[0],
): Promise<void> {
  const probe = await withAuthLimit(details, () => createAuthProbeClient(options))
  try { probe.close() } catch (err) {
    console.warn("Error closing AUTH probe client:", err)
  }
}

export async function connectToValkey(
  partialCtx: Partial<ConnectionContext>,
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string
    isRetry?: boolean
  },
) {
  const ctx = toConnectionContext(partialCtx)
  const { connectInFlight } = ctx
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
  const { clients, clusterNodesRegistry, metricsServerMap, clusterCredentials, inFlightClusterClients } = ctx

  const {
    host, port, username, password, tls: useTLS,
    verifyTlsCertificate, authType, awsRegion, awsReplicationGroupId,
  } = payload.connectionDetails
  // VALKEY_CA_CERT_PATH is a server-side default: the UI has no CA field, so a
  // UI-initiated connection can only get a private CA from the environment.
  // An empty persisted value counts as missing, hence `||` not `??`.
  const caCertPath = payload.connectionDetails.caCertPath || process.env.VALKEY_CA_CERT_PATH

  const db = payload.connectionDetails.db

  const { connectionId } = payload
  const addresses = [
    {
      host,
      port: Number(port),
    },
  ]
  let standaloneClient: GlideClient | undefined

  try {
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
        : authType === "gcp-iam"
          ? { username: "default", password: await mintGcpAccessToken(useTLS, verifyTlsCertificate) }
          : password ? { username, password } : undefined

    if (!isValidDatabaseIndex(db)) {
      throw new ConnectionRejectedError(
        "Invalid Database_Index: must be a non-negative integer",
      )
    }

    // Valkey must accept the presented credentials before anything else: before
    // an existing client is handed over (the owner identity is not secret, so it
    // never grants reuse by itself) and before a retry closes the stale client.
    await verifyCredentials(payload.connectionDetails, {
      addresses, credentials, useTLS, verifyTlsCertificate, caCertPath,
    })

    // A retry replaces the stale client only after the new client exists, so a
    // failed retry cannot close a client that works. Cluster clients are
    // repointed in updateClusterNodesClient.
    const staleStandalone = payload.isRetry ? clients.get(connectionId)?.client : undefined
    const replaceStale = () => {
      if (!(staleStandalone instanceof GlideClient)) return
      if (clients.get(connectionId)?.client === staleStandalone) clients.delete(connectionId)
      try { staleStandalone.close() } catch (error) {
        console.log(`Error closing stale client for ${connectionId}:`, error)
      }
    }

    const existingConnection = await getExistingConnection(payload, clients)
    if (existingConnection) {
      if (existingConnection.clusterId) {
        const clusterClient = existingConnection.client as GlideClusterClient
        const { clusterId } = existingConnection
        const discoveredClusterNodes =
          clusterNodesRegistry.get(clusterId) ??
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
      const [keyEvictionPolicy, jsonModuleAvailable, existingDatabasesCount] = await Promise.all([
        getKeyEvictionPolicy(existingStandalone),
        checkJsonModuleAvailability(existingStandalone, connectionId),
        getDatabasesCount(existingStandalone),
      ])
      sendStandaloneConnectFulfilled(ws, {
        connectionId,
        connectionDetails: {
          keyEvictionPolicy,
          jsonModuleAvailable,
          ...(existingDatabasesCount !== null && { databasesCount: existingDatabasesCount }),
        },
      })
      subscribe(scopedId(ctx.ownerKey, connectionId), ws)
      return existingStandalone
    }
    
    standaloneClient = await createStandaloneValkeyClient({
      addresses,
      credentials,
      useTLS,
      verifyTlsCertificate,
      caCertPath,
    })
    replaceStale()

    // Open the registration gate: the metrics process spawned below will POST
    // /register back to the orchestrator and the handler checks clients.has(connectionId).
    // The finally block below ensures we close this gate on every exit path.
    clients.set(connectionId, { client: standaloneClient })

    // Start metrics server for the connected node before cluster detection.
    // The spawn is independent of the probe client and does not affect SELECT gating.
    if (!isKubernetes) {
      const metricsNodeId = toNodeId(connectionId)
      if (!metricsServerMap.has(metricsNodeId)) {
        await startMetricsServer(payload.connectionDetails, metricsNodeId, ctx)
      }
    }

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

      // Valkey 9 clusters expose the count as `cluster-databases` with fall back to `databases`.
      if (clusterDatabaseId > 0) {
        const clusterDatabasesCount = await getDatabasesCount(
          standaloneClient,
          ["cluster-databases", "databases"],
        )
        if (clusterDatabasesCount !== null && clusterDatabaseId >= clusterDatabasesCount) {
          throw new ConnectionRejectedError(
            `Database_Index ${db} is out of range: this cluster has cluster-databases = ` +
            `${clusterDatabasesCount} (valid range 0..${clusterDatabasesCount - 1})`,
          )
        }
      }

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
            caCertPath,
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
        clusterNodesRegistry.set(clusterId, discoveredClusterNodes)

        if (isWebMode) {
          reconcileClusterMetricsServers(ctx)
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
        if (authType === "gcp-iam") registerGcpTokenRefresh(clusterClient, `cluster ${clusterId}`, useTLS, verifyTlsCertificate)
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

    const databasesCount = await getDatabasesCount(standaloneClient)
    if (databasesCount !== null && db >= databasesCount) {
      throw new ConnectionRejectedError(
        `Database_Index ${db} is out of range: this server has databases = ` +
        `${databasesCount} (valid range 0..${databasesCount - 1})`,
      )
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
        caCertPath,
        databaseId: db,
      })
      clients.set(connectionId, { client: standaloneClient })
    }

    console.log("Connected to standalone")

    subscribe(scopedId(ctx.ownerKey, payload.connectionId), ws)

    const [keyEvictionPolicy, jsonModuleAvailable] = await Promise.all([
      getKeyEvictionPolicy(standaloneClient),
      checkJsonModuleAvailability(standaloneClient, connectionId),
    ])
    sendStandaloneConnectFulfilled(ws, {
      connectionId,
      connectionDetails: {
        keyEvictionPolicy,
        jsonModuleAvailable,
        ...(databasesCount !== null && { databasesCount }),
      },
    })

    if (authType === "gcp-iam") registerGcpTokenRefresh(standaloneClient, connectionId, useTLS, verifyTlsCertificate)
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
    const rawMessage = err instanceof Error ? err.message : String(err)
    // Fallback for db-switch failures the proactive CONFIG GET range check
    // couldn't catch (e.g. CONFIG GET denied by ACL): Glide's handshake
    // rejects with a ClosingError whose message carries the server's refusal.
    const isDbSwitchFailure =
      db > 0 &&
      !(err instanceof ConnectionRejectedError) &&
      /refused to switch database|DB index is out of range/i.test(rawMessage)
    const errorMessage = isDbSwitchFailure
      ? `Database_Index ${db} is not enabled on this server (it rejected SELECT ${db}). ` +
        "Check the server's configured database count with CONFIG GET databases " +
        "(or cluster-databases for Valkey 9+ clusters) and choose an index below it."
      : rawMessage
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
  // VALKEY_CA_CERT_PATH is a server-side default: the UI has no CA field, so a
  // UI-initiated discovery can only get a private CA from the environment.
  // An empty persisted value counts as missing, hence `||` not `??`.
  const caCertPath = connectionDetails.caCertPath || process.env.VALKEY_CA_CERT_PATH

  const addresses = [{ host, port: Number(port) }]

  let client: GlideClient | undefined
  try {
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
        : authType === "gcp-iam"
          ? { username: "default", password: await mintGcpAccessToken(useTLS, verifyTlsCertificate) }
          : password ? { username, password } : undefined

    // Cluster discovery is read-only `CLUSTER SLOTS` against the seed node;
    // database selection is irrelevant for cluster commands. Skip
    // `databaseId` entirely so Glide does not issue `SELECT` (cluster nodes
    // reject `SELECT` even for db 0).
    await verifyCredentials(connectionDetails, { addresses, credentials, useTLS, verifyTlsCertificate, caCertPath })
    client = await createStandaloneValkeyClient({ addresses, credentials, useTLS, verifyTlsCertificate, caCertPath })
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

  // Stop the GCP IAM token-refresh timer before closing so the stale client is
  // released immediately rather than lingering until the next refresh interval.
  unregisterGcpTokenRefresh(existingClusterConnection.client)
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

  const [clusterSlotStatsEnabled, keyEvictionPolicy, jsonModuleAvailable, databasesCount] = await Promise.all([
    getClusterSlotStatsEnabled(clusterClient),
    getKeyEvictionPolicy(clusterClient),
    checkJsonModuleAvailability(clusterClient, connectionId),
    getDatabasesCount(clusterClient, ["cluster-databases", "databases"]),
  ])

  clusterNodesRegistry.set(clusterId, discoveredClusterNodes)
  clients.set(connectionId, { client: clusterClient, clusterId })

  const nodes = connectedNodesByCluster.get(clusterId)
  if (nodes === undefined) connectedNodesByCluster.set(clusterId, [connectionId])
  else if (!nodes.includes(connectionId)) nodes.push(connectionId)

  subscribe(scopedId(ctx.ownerKey, connectionId), ws)

  sendAddCluster(ws, clusterId, discoveredClusterNodes)
  sendClusterConnectFulfilled(ws, {
    connectionId,
    address: seedAddress,
    connectionDetails: {
      clusterId,
      keyEvictionPolicy,
      clusterSlotStatsEnabled,
      jsonModuleAvailable,
      ...(databasesCount !== null && { databasesCount }),
    },
  })

  return clusterClient
}

function sendStandaloneConnectFulfilled(ws: WebSocket, payload: StandaloneConnectFulfilledPayload) {
  ws.send(JSON.stringify({ type: VALKEY.CONNECTION.standaloneConnectFulfilled, payload }))
}

export async function discoverCluster(
  client: GlideClient | GlideClusterClient, 
  payload: { connectionDetails: NodeInfo, connectionId?: string;},
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
          ...(payload.connectionDetails.authType === "gcp-iam" && {
            authType: "gcp-iam" as const,
          }),
          tls: payload.connectionDetails.tls,
          verifyTlsCertificate: payload.connectionDetails.verifyTlsCertificate,
          caCertPath: payload.connectionDetails.caCertPath,
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
      caCertPath?: string,
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

  // `clients` holds only the clients of the connecting owner identity, and the
  // caller must prove the credentials with a fresh AUTH before it reuses a match.
  // Prevent duplicate connections:
  // 1) This connectionId already has a client
  // 2) Or any resolved host:port:db is already connected
  if (clients.has(connectionId)) return clients.get(connectionId)

  const resolvedAddresses = (await resolveHostnameOrIpAddress(connectionDetails.host)).addresses
  const db = connectionDetails.db
  const existingConnectionId = resolvedAddresses
    .map((address) => buildConnectionId(address, connectionDetails.port, db))
    .find((key) => clients.has(key))

  return existingConnectionId ? clients.get(existingConnectionId) : undefined
}

export async function closeMetricsServer(
  connectionId: string,
  ctx: Pick<OwnerState, "metricsServerMap" | "clients" | "collectorKeys">,
) {
  const { metricsServerMap, clients } = ctx
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
    const res = await fetch(buildUrl(metricsServerUri, "/connection/close"), 
      { method: "POST",
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ connectionId: nodeId }), 
      })
    if (res.ok) {
      metricsServerMap.delete(nodeId)
      forgetCollectorKey(nodeId, ctx as OwnerState)
      console.log(`Metrics server for ${nodeId} closed successfully`)
    }
    else console.warn("Could not kill metrics server process")
  }
}

/**
 * Close an owner's client for `connectionId` when no other entry shares it.
 *
 * The env owner (the preconfigured identity) keeps the lifecycle it had
 * before: in Web mode its collectors and cluster topology stay. For every
 * other owner, the cluster topology goes with the owner's last client on the
 * cluster, and the owner's collectors stop when no remaining connection of
 * that owner uses their node.
 */
export function teardownConnection(
  partialCtx: Partial<OwnerState>,
  connectionId: string,
) {
  const ctx = toConnectionContext(partialCtx)
  const { clients, clusterNodesRegistry, clusterCredentials, ownerKey, env } = ctx

  // In web mode, the env owner's metrics servers are managed by the orchestrator
  if (env && !isWebMode) {
    closeMetricsServer(connectionId, ctx).catch((err) =>
      console.error(`Error closing metrics server for ${connectionId}:`, err),
    )
  }

  const connection = clients.get(connectionId)
  clients.delete(connectionId)

  if (connection && ![...clients.values()].some((c) => c.client === connection.client)) {
    unregisterGcpTokenRefresh(connection.client)
    try {
      connection.client.close()
    } catch (error) {
      console.error(`Error closing connection ${connectionId}:`, error)
    }

    if (connection.clusterId) {
      // Polling ends with the client; drop all CPU baselines so a reconnect starts fresh
      Object.keys(clusterNodesRegistry.get(connection.clusterId) ?? {}).forEach(
        (nodeId) => clearCpuSamples(scopedId(ownerKey, nodeId)),
      )

      if (!env || !isWebMode) {
        clusterNodesRegistry.delete(connection.clusterId)
        clusterCredentials.delete(connection.clusterId)
      }
    }
  }

  if (!env) {
    pruneOwnerCollectors(ctx).catch((err) =>
      console.error(`Error stopping collectors after ${connectionId} closed:`, err),
    )
  }
}
