import { GlideClient, GlideClusterClient, InfoOptions, ServerCredentials, ServiceType } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "valkey-common"
import { isValidDatabaseIndex, normalizeEndpoint, sanitizeUrl, toNodeId, buildUrl, type Endpoint } from "valkey-common"
import { assertIamTransport, mintGcpAccessToken, registerGcpTokenRefresh, unregisterGcpTokenRefresh } from "valkey-common"
import { KeyEvictionPolicy } from "common/dist"
import { 
  getClusterSlotStatsEnabled, 
  getKeyEvictionPolicy, 
  getServerVersion,
  parseInfo, 
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
import { removeOwnerStateIfUnused, type OwnerState } from "./owner"

/**
 * One owner's state plus the requesting socket's cluster bookkeeping. All
 * clients, topology and collectors here belong to the Valkey identity the
 * connection authenticates as.
 */
export type ConnectionContext = OwnerState & {
  connectedNodesByCluster: Map<string, string[]>
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

/**
 * The CA file Glide trusts, if any. Always the operator's `VALKEY_CA_CERT_PATH`.
 * A client-supplied `caCertPath` is ignored: the client must not choose which
 * file on the server's disk becomes a trust root, and for `gcp-iam` this file
 * is what keeps the server's access token from reaching a stranger's host.
 * An empty value counts as missing, hence `||`.
 */
export const serverCaCertPath = (): string | undefined => process.env.VALKEY_CA_CERT_PATH || undefined

/**
 * Glide credentials for `details`. Mints a token for GCP IAM. IAM credentials
 * are built only for a verified TLS channel (`assertIamTransport`).
 */
async function buildCredentials(details: ConnectionDetails): Promise<ServerCredentials | undefined> {
  const { username, password, tls, verifyTlsCertificate, authType, awsRegion, awsReplicationGroupId } = details
  const caCertPath = serverCaCertPath()
  assertIamTransport({ authType, tls, verifyTlsCertificate }, caCertPath)
  if (authType === "iam") {
    return {
      username: username!,
      iamConfig: { clusterName: awsReplicationGroupId!, service: ServiceType.Elasticache, region: awsRegion! },
    }
  }
  if (authType === "gcp-iam") {
    return { username: "default", password: await mintGcpAccessToken(tls, verifyTlsCertificate, caCertPath) }
  }
  return password ? { username, password } : undefined
}

/** What the AUTH probe learned about the node: standalone, or a cluster with its topology. */
export type ProbedTopology =
  | { cluster: false }
  | { cluster: true; clusterId: string; discoveredClusterNodes: ClusterNodeMap }

/**
 * Prove that Valkey accepts `details`' credentials on `endpoint`, and learn
 * whether the node is in a cluster. Throws when Valkey rejects the credentials
 * (or the limit is reached). Call it before anything is created for the owner,
 * so a rejected request leaves nothing behind.
 *
 * The owner is chosen from what the probe proves: this identity, accepted by
 * this endpoint, and for a cluster the topology this endpoint reports. So the
 * probe, not a later client, runs `INFO cluster` and `CLUSTER SLOTS`.
 */
export async function proveCredentials(details: ConnectionDetails, endpoint: Endpoint): Promise<ProbedTopology> {
  const credentials = await buildCredentials(details)
  return verifyCredentials(details, {
    addresses: [{ host: endpoint.host, port: endpoint.port }],
    credentials,
    useTLS: details.tls,
    verifyTlsCertificate: details.verifyTlsCertificate,
    caCertPath: serverCaCertPath(),
  }, async (probe) => {
    if (!(await belongsToCluster(probe))) return { cluster: false }
    const { discoveredClusterNodes, clusterId } = await discoverCluster(probe, { connectionDetails: details })
    if (typeof clusterId !== "string" || !clusterId) throw new Error("Failed to discover cluster")
    return { cluster: true, clusterId, discoveredClusterNodes }
  })
}

/**
 * Prove that Valkey accepts `details`' credentials on this node: open a
 * short-lived client, run `inspect` on it, then close it. Throws on rejection.
 * Counted by the failed-AUTH limit. Valkey Admin does not compare secrets
 * itself; it holds the cluster password in memory only to start collectors.
 *
 * Every connect and discovery runs this first. The working clients use
 * static node discovery, which does not reject bad credentials at creation.
 */
async function verifyCredentials<T>(
  details: ConnectionDetails,
  options: Parameters<typeof createAuthProbeClient>[0],
  inspect: (probe: GlideClient) => Promise<T>,
): Promise<T> {
  const probe = await withAuthLimit(details, options.addresses[0], () => createAuthProbeClient(options))
  try {
    return await inspect(probe)
  } finally {
    try { probe.close() } catch (err) {
      console.warn("Error closing AUTH probe client:", err)
    }
  }
}

export async function connectToValkey(
  ctx: ConnectionContext,
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string
    isRetry?: boolean
  },
  options: ConnectOptions = {},
) {
  // Per-connectionId mutex (per owner) around the entire connectToValkey body. The
  // second connector enters only after the first has fully committed (or failed),
  // at which point the getExistingConnection path reuses the committed entry
  // (standalone or cluster). Concurrent cluster-client creations are deduplicated
  // per owner by clusterId in `ctx.inFlightClusterClients`.
  const { connectInFlight } = ctx
  const { connectionId } = payload
  const priorConnect = connectInFlight.get(connectionId) ?? Promise.resolve()
  // .catch swallows the prior connect's failure so our turn still runs.
  const currentConnect = priorConnect.catch(() => {}).then(() =>
    connectToValkeyLocked(ctx, ws, payload, options),
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

type ConnectOptions = {
  /**
   * The AUTH probe's result, when the caller ran it (`connectPending` does,
   * before it picks the owner). Without it the connect runs the probe itself.
   */
  probed?: ProbedTopology
  /** The endpoint from `normalizeEndpoint`. Defaults to the details' host and `Number(port)`. */
  endpoint?: Endpoint
}

async function connectToValkeyLocked(
  ctx: ConnectionContext,
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string
    isRetry?: boolean
  },
  options: ConnectOptions,
) {
  const { clients, clusterNodesRegistry, metricsServerMap, clusterCredentials, inFlightClusterClients } = ctx

  const { tls: useTLS, verifyTlsCertificate, authType } = payload.connectionDetails
  const caCertPath = serverCaCertPath()

  const db = payload.connectionDetails.db

  const { connectionId } = payload
  const endpoint = options.endpoint
    ?? { host: payload.connectionDetails.host, port: Number(payload.connectionDetails.port) }
  const addresses = [endpoint]
  let standaloneClient: GlideClient | undefined

  try {
    const credentials = await buildCredentials(payload.connectionDetails)

    if (!isValidDatabaseIndex(db)) {
      throw new ConnectionRejectedError(
        "Invalid Database_Index: must be a non-negative integer",
      )
    }

    // Valkey must accept the presented credentials before anything else: before
    // an existing client is handed over (the owner key is not secret, so it
    // never grants reuse by itself) and before a retry closes the stale client.
    // The caller may already have proven them (connectPending does, before it
    // picks the owner's state).
    const probed = options.probed ?? await proveCredentials(payload.connectionDetails, endpoint)

    // A retry replaces the stale client only after the new client exists, so a
    // failed retry cannot close a client that works. A standalone client is
    // replaced before the new one is stored (replaceStaleStandalone); a cluster
    // client is closed after commitClusterConnection has replaced the map entry
    // (closeStaleCluster).
    const staleClient = payload.isRetry ? clients.get(connectionId)?.client : undefined
    const staleStandalone = staleClient instanceof GlideClient ? staleClient : undefined
    const staleCluster = staleClient instanceof GlideClusterClient ? staleClient : undefined
    const replaceStaleStandalone = () => {
      if (!staleStandalone) return
      if (clients.get(connectionId)?.client === staleStandalone) clients.delete(connectionId)
      try { staleStandalone.close() } catch (error) {
        console.log(`Error closing stale client for ${connectionId}:`, error)
      }
    }
    // Close the cluster client a retry replaced, unless another connectionId of
    // this owner still uses it. Stop its token refresh first so the client does
    // not linger until the next refresh tick.
    const closeStaleCluster = (replacement: GlideClusterClient) => {
      if (!staleCluster || staleCluster === replacement) return
      if ([...clients.values()].some((entry) => entry.client === staleCluster)) return
      unregisterGcpTokenRefresh(staleCluster)
      try { staleCluster.close() } catch (error) {
        console.log(`Error closing stale cluster client for ${connectionId}:`, error)
      }
    }

    const existingConnection = getExistingConnection(payload, clients)
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
    replaceStaleStandalone()

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

    // The AUTH probe already decided standalone or cluster and fetched the
    // topology. Read the Server_Version on this client BEFORE issuing any
    // `SELECT`. This is required for cluster gating: cluster nodes reject
    // `SELECT N` for any N (even 0), so we cannot bind the client to a `db`
    // without losing the chance to surface a friendly version-gating error.
    const serverVersion = probed.cluster ? await getServerVersion(standaloneClient) : null

    if (probed.cluster) {
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

      const { discoveredClusterNodes, clusterId } = probed
      standaloneClient.close()

      // Each node connection has its own cluster client today. Reuse of one
      // owner's cluster client for a second node is left to the cluster-id
      // overhaul. `inFlightClusterClients` only deduplicates concurrent creation.
      let clusterClient: GlideClusterClient
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
        closeStaleCluster(clusterClient)

        shouldCloseClusterClientOnError = false
        if (authType === "gcp-iam") {
          registerGcpTokenRefresh(clusterClient, `cluster ${clusterId}`, useTLS, verifyTlsCertificate, caCertPath)
        }
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

    if (authType === "gcp-iam") registerGcpTokenRefresh(standaloneClient, connectionId, useTLS, verifyTlsCertificate, caCertPath)
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

  try {
    // The probe proves the credentials and reads `CLUSTER SLOTS` from the seed
    // node. No client is kept: discovery creates no owner state.
    const endpoint = normalizeEndpoint(connectionDetails.host, connectionDetails.port)
    const probed = await proveCredentials(connectionDetails, endpoint)
    if (!probed.cluster || Object.keys(probed.discoveredClusterNodes).length < 1) {
      throw new Error("Unable to discover cluster")
    }
    const { discoveredClusterNodes } = probed
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
  }
}

export async function belongsToCluster(client: GlideClient): Promise<boolean> {
  const response = await client.info([InfoOptions.Cluster])
  const parsed = parseInfo(response)
  return parsed["cluster_enabled"] === "1"
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

/**
 * The owner's existing client for this connectionId, if any. `clients` holds
 * only the clients of one owner (one Valkey user on one deployment), so a hit
 * is a client this identity already opened to this deployment. Reuse is by id
 * only; the caller proved the credentials with a fresh AUTH first.
 */
export function getExistingConnection(
  payload: { connectionId: string, isRetry?: boolean },
  clients: Map<string, { client: GlideClient | GlideClusterClient, clusterId?: string }>,
): { client: GlideClient | GlideClusterClient; clusterId?: string | undefined } | undefined {
  // If the frontend is retrying a broken connection, it's not a duplicate
  if (payload.isRetry) return undefined
  return clients.get(payload.connectionId)
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
  ctx: OwnerState,
  connectionId: string,
) {
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
    pruneOwnerCollectors(ctx)
      .then(() => removeOwnerStateIfUnused(ctx))
      .catch((err) => console.error(`Error stopping collectors after ${connectionId} closed:`, err))
    removeOwnerStateIfUnused(ctx)
  }
}
