import { GlideClient, GlideClusterClient, ConnectionError, ServiceType } from "@valkey/valkey-glide"
import { ChildProcess, spawn } from "child_process"
import { fileURLToPath } from "url"
import * as R from "ramda"
import { Router, type Request, type Response } from "express"
import path from "path"
import { DEPLOYMENT_TYPE, sanitizeUrl } from "valkey-common"
import { discoverCluster } from "./connection"
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

type ClusterNodeInfo = {
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

export type ClusterNodeMap = Record<string, ClusterNodeInfo>;

export interface ClusterRegistry {
  [clusterId: string]: ClusterNodeMap
}

export const clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}> = new Map()

export const clusterNodesRegistry: ClusterRegistry = {}

export const clusterCredentials: Map<string, string | undefined> = new Map()

export const metricsServerMap: MetricsServerMap = new Map()

export const isWebMode = process.env.DEPLOYMENT_MODE === DEPLOYMENT_TYPE.WEB
export const isKubernetes = process.env.DEPLOYMENT_MODE === DEPLOYMENT_TYPE.K8
export const isElectron = process.env.DEPLOYMENT_MODE === DEPLOYMENT_TYPE.ELECTRON

// Validate env variable so it matches EndpointType
const endpointType = process.env.VALKEY_ENDPOINT_TYPE === "node" ? "node" : "cluster-endpoint"

export const initialConnectionDetails: ConnectionDetails = {
  host: process.env.VALKEY_HOST ?? "",
  port: process.env.VALKEY_PORT ?? "",
  username: process.env.VALKEY_USERNAME,
  password: process.env.VALKEY_PASSWORD,
  tls: process.env.VALKEY_TLS === "true",
  verifyTlsCertificate: process.env.VALKEY_VERIFY_CERT === "true",
  endpointType,
  authType: process.env.VALKEY_AUTH_TYPE === "iam" ? "iam" : "password",
  awsRegion: process.env.VALKEY_AWS_REGION,
  awsReplicationGroupId: process.env.VALKEY_REPLICATION_GROUP_ID,
}

const ttl = Number(process.env.TTL) || 60000

function isKnownClusterNode(nodeId: string) {
  return Object.values(clusterNodesRegistry).some((clusterNodes) =>
    Object.entries(clusterNodes).some(([primaryNodeId, primaryNode]) =>
      primaryNodeId === nodeId ||
      primaryNode.replicas?.some((replica) => sanitizeUrl(`${replica.host}-${replica.port}`) === nodeId),
    ),
  )
}

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

export function createMetricsOrchestratorRouter() {
  const router = Router()

  router.post("/register", (req: Request, res: Response) => {
    const { metricsServerUri, nodeId, pid } = req.body

    const nodeBelongsToCluster = isKnownClusterNode(nodeId)
    const nodeConnected = clients.has(nodeId)

    if (nodeBelongsToCluster || nodeConnected)  {
      const now = Date.now()  
      const entry = metricsServerMap.get(nodeId)
      console.log(`Metrics server registered for ${nodeId} at ${metricsServerUri}`)
      // If we spawned the metrics process using the orchestrator
      if (entry) {
        entry.metricsURI = metricsServerUri 
        entry.lastSeen = now
        res.send("Registered node")
      }
      // If the metrics process was spawned using connection epic
      else {
        metricsServerMap.set(nodeId, {
          metricsURI: metricsServerUri,
          pid: Number(pid),
          lastSeen: now,
        })
        res.send("Registered node")
      }
    }   
    else {
      res.status(404).send("Invalid nodeId")
    }
  })

  router.post("/ping", async (req: Request, res: Response) => {
    const { nodeId } = req.body
    const entry = metricsServerMap.get(nodeId)
    if (entry) {
      entry.lastSeen = Date.now()
      res.sendStatus(200)
    }
    else {
      res.status(404).send("Node not found")
    }
  })
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
  const { host, port, username, password, tls, verifyTlsCertificate, authType, awsRegion, awsReplicationGroupId } = connectionDetails
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

  return await createOrchestratorValkeyClient({ addresses, credentials, useTLS: tls, verifyTlsCertificate })
}

async function getClusterTopology(client: GlideClusterClient | GlideClient | null, node: ConnectionDetails) {
  if (!client) client = await createClient(node)

  const { discoveredClusterNodes, clusterId } = await discoverCluster(client, { connectionDetails: node })

  return { discoveredClusterNodes, clusterId }
}

export async function updateClusterNodeRegistry(client: GlideClusterClient | GlideClient | null, connectionDetails = initialConnectionDetails) {
  try {
    const { discoveredClusterNodes, clusterId } = await getClusterTopology(client, connectionDetails)
    if (clusterId && discoveredClusterNodes) clusterNodesRegistry[clusterId] = discoveredClusterNodes 
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
      return (!clusterNodes[key] && !clients.has(key)) || (now - value.lastSeen) > ttl
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
  const entries = Object.entries(nodesToStart).filter(([nodeId]) => !metricsServerMap.has(nodeId))
  await R.splitEvery(30, entries).reduce(
    (prev, batch) => prev
      .then(() => Promise.all(batch.map(([nodeId, nodeInfo]) => startMetricsServer({ ...nodeInfo, password }, nodeId))))
      .then(() => new Promise((r) => setTimeout(r, 500))),
    Promise.resolve(),
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
}

export async function startMetricsServer(nodeToStart: ClusterNodeInfo, nodeId: string) {
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
  const proc: ChildProcess = spawn(process.execPath, [metricsServerPath], {
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
      DATA_DIR: `${data_dir}/${nodeId}`,
      CONFIG_PATH: configPath,
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
      return
    }
    if (entry?.pid) {
      process?.kill(entry.pid,"SIGTERM")
      metricsServerMap.delete(nodeToStop)
    }
  }
  catch (e) {
    console.warn(`Failed to kill metrics server for ${nodeToStop}:`, e)
  }
}

export async function reconcileClusterMetricsServers(
  clusterNodesRegistry: ClusterRegistry, 
  metricsServerMap: MetricsServerMap, 
  connectionDetails: ConnectionDetails, 
) {
  let clusterIds = Object.keys(clusterNodesRegistry) 
  if (clusterIds.length === 0) {
    try {
      const client = await getInitialClient()
      const { discoveredClusterNodes, clusterId } = await internals.getClusterTopology(client, connectionDetails)
      if (clusterId && discoveredClusterNodes) {
        clusterNodesRegistry[clusterId] = discoveredClusterNodes 
        if (!clusterCredentials.has(clusterId)) clusterCredentials.set(clusterId, initialConnectionDetails.password)
      } 
      clusterIds = Object.keys(clusterNodesRegistry)
    } catch (err) {
      console.error(err)
    }
  }
  await Promise.all(
    clusterIds.map(async (clusterId) => {
      try {
        const { nodesToAdd, nodesToRemove } = await internals.findDiff(metricsServerMap, clusterNodesRegistry[clusterId])
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

export function cleanupOrchestratorResources() {
  initialClient?.close()
  stopAllMetricsServers(metricsServerMap)
  metricsServerMap.clear()

  for (const key in clusterNodesRegistry) {
    delete clusterNodesRegistry[key]
  }
}

// To help mock internal methods in tests
const internals =  {
  startMetricsServers,
  createClient,
  getClusterTopology,
  updateClusterNodeRegistry,
  findDiff,
  isKnownClusterNode,
  flattenClusterNodeMap,
  updateMetricsServers,
  stopMetricsServers,
  stopMetricsServer,
  ttl,
}

export { internals as __test__ }
