/**
 * Metrics orchestration boundary.
 *
 * Two id-spaces flow through this module:
 *   - Connection_Identifier `<host>-<port>-db<N>` — keys of the `clients` map.
 *   - Metrics-node-id       `<host>-<port>`       — keys of `metricsServerMap`
 *                                                   and `clusterNodesRegistry[clusterId]`.
 *
 * The relationship is N:1 (many Connection_Identifiers per metrics-node-id):
 * a metrics process is one OS process per Valkey node, and the data it
 * collects (INFO, MEMORY STATS, MONITOR, COMMANDLOG) is server-global, not
 * db-scoped. Use `toNodeId` at every boundary; never use the metrics
 * map directly with a Connection_Identifier.
 */
import { GlideClient, GlideClusterClient, ConnectionError, ServiceType } from "@valkey/valkey-glide"
import { ChildProcess, spawn, type SpawnOptions } from "child_process"
import { fileURLToPath } from "url"
import { Router, type Request, type Response } from "express"
import path from "path"
import {
  DEPLOYMENT_TYPE,
  ORCHESTRATOR_AUTH_DOMAIN,
  ORCHESTRATOR_AUTH_HEADER,
  ORCHESTRATOR_AUTH_KEY_ENV,
  ORCHESTRATOR_AUTH_WINDOW_ENV,
  generateOrchestratorAuthKey,
  isNodeId,
  resolveOrchestratorAuthWindowMs,
  sanitizeUrl,
  toNodeId,
  verifyOrchestratorAuthCredential
} from "valkey-common"
import { discoverCluster, belongsToCluster } from "./connection"
import { ConnectionDetails } from "./actions/connection"
import { createOrchestratorValkeyClient } from "./valkey-client"

// Assumes nodeId is unique among all clusters
export type MetricsServerMap = Map<string,
  {
    metricsURI: string;
    pid: number | undefined;
    lastSeen: number;
  }
>

type NodeInfo = {
  host: string;
  port: number | string;
  username?: string;
  password?: string;
  tls: boolean;
  verifyTlsCertificate: boolean;
  replicas?: { id: string; host: string; port: number }[];
  authType?: "password" | "iam";
  awsRegion?: string;
  awsReplicationGroupId?: string;
}

export type ClusterNodeMap = Record<string, NodeInfo>;

export const clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}> = new Map()

export const clusterNodesRegistry: Map<string, ClusterNodeMap> = new Map()

export const clusterCredentials: Map<string, string | undefined> = new Map()

export const metricsServerMap: MetricsServerMap = new Map()

/**
 * HMAC key material for spawned collectors, keyed by metrics-node-id.
 */
const collectorKeys: Map<string, string> = new Map()

/**
 * Resolve the only key material acceptable for `nodeId`.
 *
 * A spawned collector's key is authoritative for its node: nothing else may
 * be accepted in its place, or a credential valid for one node could be
 * replayed against another.
 */
export function resolveCollectorKey(nodeId: string): string | undefined {
  return collectorKeys.get(nodeId)
}

/**
 * Drop a collector's key. Called wherever a `metricsServerMap` entry is
 * removed so the two stay in lockstep and no secret outlives the process it
 * belonged to.
 */
export function forgetCollectorKey(nodeId: string): void {
  collectorKeys.delete(nodeId)
}

export const isWebMode = process.env.DEPLOYMENT_MODE === DEPLOYMENT_TYPE.WEB
export const isKubernetes = process.env.DEPLOYMENT_MODE === DEPLOYMENT_TYPE.K8
export const isElectron = process.env.DEPLOYMENT_MODE === DEPLOYMENT_TYPE.ELECTRON

export const preConfiguredConnection = process.env.VALKEY_HOST && process.env.VALKEY_PORT

// Validate env variable so it matches EndpointType
const endpointType = process.env.VALKEY_ENDPOINT_TYPE === "node" ? "node" : "cluster-endpoint"

export const initialConnectionDetails: ConnectionDetails = {
  host: process.env.VALKEY_HOST ?? "",
  port: process.env.VALKEY_PORT ?? "",
  username: process.env.VALKEY_USERNAME,
  password: process.env.VALKEY_PASSWORD,
  tls: process.env.VALKEY_TLS === "true",
  // Default certificate verification ON. Only an explicit VALKEY_VERIFY_CERT=false disables it,
  // so an unset variable never silently downgrades a TLS connection to insecure (see #445).
  verifyTlsCertificate: process.env.VALKEY_VERIFY_CERT !== "false",
  endpointType,
  authType: process.env.VALKEY_AUTH_TYPE === "iam" ? "iam" : "password",
  awsRegion: process.env.VALKEY_AWS_REGION,
  awsReplicationGroupId: process.env.VALKEY_REPLICATION_GROUP_ID,
  db: Number(process.env.VALKEY_DB ?? 0),
}

const ttl = Number(process.env.TTL) || 60000

// Reconciliation works on flat node ids, but cluster discovery stores replicas under their primary.
function flattenClusterNodeMap(clusterNodeMap: ClusterNodeMap): ClusterNodeMap {
  return Object.entries(clusterNodeMap).reduce((acc, [primaryNodeId, primaryNode]) => {
    acc[primaryNodeId] = primaryNode

    primaryNode.replicas?.forEach((replica) => {
      const replicaNodeId = sanitizeUrl(`${replica.host}-${replica.port}`)
      acc[replicaNodeId] = {
        host: replica.host,
        port: replica.port,
        tls: primaryNode.tls,
        verifyTlsCertificate: primaryNode.verifyTlsCertificate,
      }
    })

    return acc
  }, {} as ClusterNodeMap)
}

/**
 * Read the credential header, rejecting a repeated header outright: express
 * surfaces duplicates as an array, and picking one would let a client stage
 * two candidate credentials per request.
 */
function readOrchestratorAuthHeader(req: Request): string | undefined {
  const raw = req.headers[ORCHESTRATOR_AUTH_HEADER]
  return typeof raw === "string" ? raw : undefined
}

/**
 * Longest `nodeId` accepted. Ids are `<host>-<port>` passed through
 * `sanitizeUrl`, so the theoretical maximum is a 253-character DNS name plus a
 * separator and a five-digit port — 259. The bound exists only to stop an
 * unauthenticated caller pushing an unbounded string into the log.
 */
const MAX_NODE_ID_LENGTH = 320

/**
 * Gate `nodeId` at the route boundary, before it is verified or logged.
 *
 * `isNodeId` restricts the value to `[a-zA-Z0-9_-]`, which every legitimate id
 * satisfies by construction: both the orchestrator and the collector derive
 * ids through `sanitizeUrl`, which maps everything else to `-`. Enforcing that
 * here means any id reaching the rest of the handler is safe by type — no
 * newlines to forge log records with, no control characters or terminal escape
 * sequences, and a bounded length. An id that fails this check cannot match
 * any collector, so rejecting it early costs nothing.
 */
function isAcceptableNodeId(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= MAX_NODE_ID_LENGTH
    && isNodeId(value)
}

/**
 * A metrics URI is only usable as a `fetch` base if it parses, speaks
 * http(s), and carries no path, query, or fragment of its own.
 */
function isUsableMetricsUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false
  try {
    const { protocol, pathname, search, hash } = new URL(value)
    if (protocol !== "http:" && protocol !== "https:") return false
    // `new URL` normalizes an absent path to "/", so "/" is the only
    // acceptable pathname; anything longer is a prefix that would be dropped.
    if (pathname !== "/") return false
    if (search !== "" || hash !== "") return false
    return true
  } catch {
    return false
  }
}

/**
 * `POST /orchestrator/register` — a collector advertising where it can be
 * reached.
 *
 * Verifies before mutation, and answers 401 for everything unverifiable.
 */
function handleRegister(req: Request, res: Response): void {
  const { metricsServerUri, nodeId, timestamp } = req.body ?? {}

  if (!isAcceptableNodeId(nodeId)) {
    // Logged without the value as it is untrusted here and cannot
    // match any collector, so there is nothing about it worth recording.
    console.warn("Rejected metrics registration: malformed nodeId")
    res.status(401).send("Unauthorized")
    return
  }

  const verification = verifyOrchestratorAuthCredential({
    key: resolveCollectorKey(nodeId),
    credential: readOrchestratorAuthHeader(req),
    domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
    fields: { nodeId, metricsServerUri, timestamp },
    windowMs: resolveOrchestratorAuthWindowMs(process.env[ORCHESTRATOR_AUTH_WINDOW_ENV]),
  })

  if (!verification.ok) {
    const skew = verification.skewMs === undefined ? "" : ` (clock skew ${verification.skewMs}ms)`
    console.warn(`Rejected metrics registration for ${nodeId}: ${verification.reason}${skew}`)
    res.status(401).send("Unauthorized")
    return
  }

  if (!isUsableMetricsUri(metricsServerUri)) {
    console.warn(`Rejected metrics registration for ${nodeId}: unusable metricsServerUri`)
    res.status(400).send("Invalid metricsServerUri")
    return
  }

  const entry = metricsServerMap.get(nodeId)
  if (!entry) {
    // Key material without an entry means the spawn did not complete.
    console.warn(`Rejected metrics registration for ${nodeId}: no metrics server entry`)
    res.status(401).send("Unauthorized")
    return
  }

  entry.metricsURI = metricsServerUri
  entry.lastSeen = Date.now()
  console.log(`Metrics server registered for ${nodeId} at ${metricsServerUri}`)
  res.send("Registered node")
}

/**
 * `POST /orchestrator/ping` — a collector keeping its entry off the staleness
 * sweep. Authenticated on the same terms as registration, under a distinct
 * domain so a registration credential cannot be presented here.
 */
function handlePing(req: Request, res: Response): void {
  const { nodeId, timestamp } = req.body ?? {}

  if (!isAcceptableNodeId(nodeId)) {
    console.warn("Rejected metrics ping: malformed nodeId")
    res.status(401).send("Unauthorized")
    return
  }

  const verification = verifyOrchestratorAuthCredential({
    key: resolveCollectorKey(nodeId),
    credential: readOrchestratorAuthHeader(req),
    domain: ORCHESTRATOR_AUTH_DOMAIN.PING,
    fields: { nodeId, timestamp },
    windowMs: resolveOrchestratorAuthWindowMs(process.env[ORCHESTRATOR_AUTH_WINDOW_ENV]),
  })

  if (!verification.ok) {
    const skew = verification.skewMs === undefined ? "" : ` (clock skew ${verification.skewMs}ms)`
    console.warn(`Rejected metrics ping for ${nodeId}: ${verification.reason}${skew}`)
    res.status(401).send("Unauthorized")
    return
  }

  const entry = metricsServerMap.get(nodeId)
  if (!entry) {
    console.warn(`Rejected metrics ping for ${nodeId}: no metrics server entry`)
    res.status(401).send("Unauthorized")
    return
  }

  entry.lastSeen = Date.now()
  res.sendStatus(200)
}

export function createMetricsOrchestratorRouter() {
  const router = Router()

  router.post("/register", handleRegister)
  router.post("/ping", handlePing)

  return router
}

let initialClient: GlideClient | null = null

export async function getInitialClient() {
  if (!initialClient) {
    initialClient = await createClient(initialConnectionDetails)
  }
  return initialClient
}

async function createClient(connectionDetails: ConnectionDetails) {
  const { host, port, username, password, tls, verifyTlsCertificate, authType, awsRegion, awsReplicationGroupId, db } = connectionDetails
  const addresses = [{ host, port: Number(port) }]
  const credentials =
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

  return await createOrchestratorValkeyClient({ addresses, credentials, useTLS: tls, verifyTlsCertificate, databaseId: db })
}

async function getClusterTopology(client: GlideClusterClient | GlideClient | null, node: ConnectionDetails) {
  if (!client) client = await createClient(node)

  const { discoveredClusterNodes, clusterId } = await discoverCluster(client, { connectionDetails: node })

  return { discoveredClusterNodes, clusterId }
}

export async function updateClusterNodeRegistry(client: GlideClusterClient | GlideClient | null, connectionDetails = initialConnectionDetails) {
  try {
    const { discoveredClusterNodes, clusterId } = await getClusterTopology(client, connectionDetails)
    if (clusterId && discoveredClusterNodes) clusterNodesRegistry.set(clusterId, discoveredClusterNodes)
  }
  catch (err) {
    if (err instanceof ConnectionError) {
      console.warn("There was an error discovering cluster nodes")
    }
    console.error(err)
  }
  return clusterNodesRegistry
}

async function findDiff(metricsServerMap: MetricsServerMap, clusterNodeMap: ClusterNodeMap) {
  const clusterNodes = isKubernetes ? flattenClusterNodeMap(clusterNodeMap) : clusterNodeMap
  // These are nodes that are in the clusterMap but not metricsMap
  // TODO: Could use R.pickBy instead
  const nodesToAdd: ClusterNodeMap = Object.fromEntries(
    Object.entries(clusterNodes)
      .filter(([key]) => !metricsServerMap.has(key)),
  )
  const now = Date.now()
  // These are nodes that are in the metricsMap but not in clusterMap and clientsMap or stale nodes
  const nodesToRemove: string[] = Array.from(metricsServerMap.entries())
    .filter(([key, value]) => {
      // `key` is a metrics-node-id. `clients` keys are Connection_Identifiers.
      // Treat the metrics process as still-claimed if any open client strips
      // down to this node (N:1). Avoids evicting standalone metrics whose
      // owner connection is keyed `-db<N>`.
      const knownToClients = [...clients.keys()].some(
        (id) => toNodeId(id) === key,
      )
      return (!clusterNodes[key] && !knownToClients) || (now - value.lastSeen) > ttl
    })
    .map(([key]) => key)

  return { nodesToAdd, nodesToRemove }
}

async function updateMetricsServers(nodesToAdd: ClusterNodeMap, nodesToRemove: string[], clusterId: string) {
  await startMetricsServers(nodesToAdd, clusterId)
  await stopMetricsServers(nodesToRemove)
}

async function startMetricsServers(nodesToStart: ClusterNodeMap, clusterId: string) {
  const password = clusterCredentials.get(clusterId)
  await Promise.all(
    Object.entries(nodesToStart).map(async ([nodeId, nodeInfo]) => {
      if (!metricsServerMap.has(nodeId)) {
        await startMetricsServer({ ...nodeInfo, password }, nodeId)
      }
    }),
  )
}

async function stopMetricsServers(nodesToStop: string[]) {
  await Promise.all(
    nodesToStop.map(async (node) => {
      if (metricsServerMap.has(node)) {
        await stopMetricsServer(node)
      }  
    }),
  )
}

export async function stopAllMetricsServers(metricsMap: MetricsServerMap) {
  if (!isKubernetes) {
    metricsMap.forEach((metricsServer, nodeId) => {
      try {
        if (metricsServer.pid)
          process.kill(metricsServer.pid)
      } catch (e) {
        console.warn(`Failed to kill metrics server ${nodeId}:`, e)
      }
    })
  }
  metricsMap.clear()
  collectorKeys.clear()
}

/**
 * Indirection over `child_process.spawn` so tests can observe the environment
 * handed to a collector without starting a real process.
 */
function spawnProcess(command: string, args: string[], options: SpawnOptions): ChildProcess {
  return spawn(command, args, options)
}

export async function startMetricsServer(nodeToStart: NodeInfo, nodeId: string) {
  const processResourcesPath = process.env.PROCESS_RESOURCES_PATH  ?? ""
  const metricsServerPath = isElectron
    ? path.join(processResourcesPath, "server-metrics.js")
    : fileURLToPath(new URL("../../metrics/dist/index.cjs", import.meta.url))

  const configPath = process.env.CONFIG_PATH
    ?? (isElectron
      ? path.join(processResourcesPath, "config.yml")
      : fileURLToPath(new URL("../../metrics/config.yml", import.meta.url)))

  const data_dir = process.env.DATA_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data")

  console.log("Starting metrics server for: ", nodeId)

  // Minted before the spawn so the key is already resolvable when the child
  // races ahead and registers.
  const collectorKey = generateOrchestratorAuthKey()
  collectorKeys.set(nodeId, collectorKey)

  const proc: ChildProcess = internals.spawnProcess(process.execPath, [metricsServerPath], {
    env: {
      ...process.env,
      PORT: "0",
      VALKEY_HOST: nodeToStart.host,
      VALKEY_PORT: String(nodeToStart.port),
      VALKEY_USERNAME: nodeToStart.username,
      VALKEY_PASSWORD: nodeToStart.password,
      VALKEY_TLS: String(nodeToStart.tls),
      VALKEY_VERIFY_CERT: String(nodeToStart.verifyTlsCertificate),
      VALKEY_AUTH_TYPE: nodeToStart.authType ?? "password",
      VALKEY_AWS_REGION: nodeToStart.awsRegion,
      VALKEY_REPLICATION_GROUP_ID: nodeToStart.awsReplicationGroupId,
      SERVER_HOST: process.env.SERVER_HOST ?? "localhost",
      SERVER_PORT: process.env.SERVER_PORT ?? "8080",
      METRICS_BIND_HOST: process.env.METRICS_BIND_HOST ?? (isKubernetes ? "0.0.0.0" : "127.0.0.1"),
      DATA_DIR: `${data_dir}/${nodeId}`,
      CONFIG_PATH: configPath,
      // MUST stay after the `...process.env` spread. The orchestrator may
      // itself carry an ORCHESTRATOR_KEY (the shared key used by externally
      // managed collectors), which the spread would otherwise hand to every
      // child.
      [ORCHESTRATOR_AUTH_KEY_ENV]: collectorKey,
    },
    stdio: ["ignore", "ignore", "pipe"], // only capture stderr
  })

  // Only log stderr (errors)
  if (proc.stderr) {
    proc.stderr.on("data", (data) => {
      console.error(`[MetricsServer ${nodeId} STDERR]: ${data.toString()}`)
    })
  }

  proc.on("exit", (code, signal) => {
    if (code !== 0) {
      console.warn(`Metrics server for ${nodeToStart.host}:${nodeToStart.port} exited with code ${code} and signal ${signal}`)
    }
  })

  proc.on("error", (err) => {
    console.error(`Failed to start metrics server for ${nodeToStart.host}:${nodeToStart.port}:`, err)
  })

  // Don't need to set metricsURI here since we need to wait for server to register itself
  metricsServerMap.set(nodeId,
    {
      metricsURI: "",
      pid: proc.pid,
      lastSeen: Date.now(),
    },
  )
}

async function stopMetricsServer(nodeToStop: string) {
  try {
    console.log("Killing metrics server for ", nodeToStop)
    const entry = metricsServerMap.get(nodeToStop)
    if (isKubernetes) {
      metricsServerMap.delete(nodeToStop)
      forgetCollectorKey(nodeToStop)
      return
    }
    if (entry?.pid) {
      try { process?.kill(entry.pid, "SIGTERM") } catch { /* already dead */ }
      metricsServerMap.delete(nodeToStop)
      forgetCollectorKey(nodeToStop)
    }
  }
  catch (e) {
    console.warn(`Failed to kill metrics server for ${nodeToStop}:`, e)
  }
}

export async function reconcileClusterMetricsServers(
  metricsServerMap: MetricsServerMap, 
) {
  const clusterIds = [...clusterNodesRegistry.keys()]
  if (clusterIds.length === 0) return

  await Promise.all(
    clusterIds.map(async (clusterId) => {
      try {
        const { nodesToAdd, nodesToRemove } = await internals.findDiff(metricsServerMap, clusterNodesRegistry.get(clusterId) ?? {})
        // Early return if nothing has changed
        if (Object.keys(nodesToAdd).length === 0 && nodesToRemove.length === 0) {
          console.debug("Cluster nodes and metrics servers are in sync")
          return
        }
        await internals.updateMetricsServers(nodesToAdd, nodesToRemove, clusterId)
      } catch (err) {
        console.error(`Failed to reconcile metrics servers for cluster ${clusterId}:`, err)
      }
    }),
  )
}

export async function startPreconfiguredStandaloneMetricsServer() {
  const nodeId = sanitizeUrl(`${initialConnectionDetails.host}-${initialConnectionDetails.port}`)
  await startMetricsServer(initialConnectionDetails, nodeId)
}

export async function startPreconfiguredMetricsServers() {
  const client = await getInitialClient()
  if (await belongsToCluster(client)) {
    if (isWebMode) {
      const { discoveredClusterNodes, clusterId } = await internals.getClusterTopology(client, initialConnectionDetails)
      if (clusterId && discoveredClusterNodes) {
        clusterNodesRegistry.set(clusterId, discoveredClusterNodes)
        if (!clusterCredentials.has(clusterId)) clusterCredentials.set(clusterId, initialConnectionDetails.password)
      }
      runReconcileLoop()
    }
  } else if (!isKubernetes) {
    await startPreconfiguredStandaloneMetricsServer()
  }
}

export async function runReconcileLoop() {
  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms))
  while (true) {
    try {
      await reconcileClusterMetricsServers(metricsServerMap)
      await delay(10000)
    } catch (err) {
      console.error("Failed to reconcile metrics servers", err)
      await delay(10000)
    }
  }
}

export function cleanupOrchestratorResources() {
  initialClient?.close()
  stopAllMetricsServers(metricsServerMap)
}

// To help mock internal methods in tests
const internals =  {
  startMetricsServers,
  createClient,
  getClusterTopology,
  updateClusterNodeRegistry,
  findDiff,
  flattenClusterNodeMap,
  updateMetricsServers,
  stopMetricsServers,
  stopMetricsServer,
  ttl,
  collectorKeys,
  spawnProcess,
  handleRegister,
  handlePing,
}

export { internals as __test__ }
