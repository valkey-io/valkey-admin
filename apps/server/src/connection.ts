import { GlideClient, GlideClusterClient, InfoOptions, ServerCredentials } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "valkey-common"
import { sanitizeUrl, type KeyEvictionPolicy } from "valkey-common"
import { parseInfo, resolveHostnameOrIpAddress } from "./utils"
import { checkJsonModuleAvailability } from "./check-json-module"
import { type ConnectionDetails } from "./actions/connection"
import { MetricsServerMap, startMetricsServer } from "./metrics-orchestrator"
import { subscribe } from "./node-watchers"
import { createClusterValkeyClient, createStandaloneValkeyClient } from "./valkey-client"

export async function connectToValkey(
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string;
  },
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string }>,
  clusterNodesMap: Map<string, string[]>,
  metricsServerMap: MetricsServerMap,
) {

  const addresses = [
    {
      host: payload.connectionDetails.host,
      port: Number(payload.connectionDetails.port),
    },
  ]
  const credentials: ServerCredentials | undefined = 
    payload.connectionDetails.password ? {
      username: payload.connectionDetails.username,
      password: payload.connectionDetails.password,
    } : undefined

  try {
    // If we've connected to the same host using IP addr or vice versa, return
    if (await isDuplicateConnection(payload, clients)) {
      subscribe(payload.connectionId, ws)
      return ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.standaloneConnectFulfilled,
          payload: { connectionId: payload.connectionId },
        }),
      )
    }
    const useTLS = payload.connectionDetails.tls
    const standaloneClient = await createStandaloneValkeyClient({
      addresses,
      credentials,
      useTLS,
      verifyTlsCertificate: payload.connectionDetails.verifyTlsCertificate,
    })
    clients.set(payload.connectionId, { client: standaloneClient })
    // In cluster-orchestrator mode, metrics sidecars register themselves.
    if (process.env.USE_CLUSTER_ORCHESTRATOR !== "true" && !metricsServerMap.has(payload.connectionId)) {
      await startMetricsServer(payload.connectionDetails, payload.connectionId)
    }

    let keyEvictionPolicy: KeyEvictionPolicy = "noeviction"
    try {
      const evictionPolicyResponse = await standaloneClient.customCommand(
        ["CONFIG", "GET", "maxmemory-policy"],
      ) as [{key: string, value: string}]

      keyEvictionPolicy = R.pipe(
        R.pathOr("noeviction", [0, "value"]),
        R.toLower,
      )(evictionPolicyResponse) as KeyEvictionPolicy
    } catch {
      console.warn("Command \"CONFIG\" not available. Trying \"INFO SERVER\" instead")
      const infoResponse = await standaloneClient.info([InfoOptions.Server])
      const parsed = parseInfo(infoResponse)
      if (parsed["maxmemory_policy"]) {
        keyEvictionPolicy = parsed["maxmemory_policy"].toLowerCase() as KeyEvictionPolicy
      }
    }
    const jsonModuleAvailable = await checkJsonModuleAvailability(standaloneClient)
    
    if (await belongsToCluster(standaloneClient)) {
      return connectToCluster(
        standaloneClient, 
        ws, 
        clients, 
        payload, 
        addresses, 
        credentials, 
        keyEvictionPolicy, 
        jsonModuleAvailable, 
        clusterNodesMap,
      )
    }
    // Need to repeat connection info for metrics server
    const connectionInfo = {
      type: VALKEY.CONNECTION.standaloneConnectFulfilled,
      payload: {
        connectionId: payload.connectionId,
        connectionDetails: {
          ...payload.connectionDetails,
          keyEvictionPolicy,
          jsonModuleAvailable,
        },
      },
    }
    console.log("Connected to standalone")

    subscribe(payload.connectionId, ws)
    ws.send(
      JSON.stringify(connectionInfo),
    )
    return standaloneClient

  } catch (err) {
    console.error("Error connecting to Valkey", err)
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          err,
          connectionId: payload.connectionId,
        },
      }),
    )
    return undefined
  }
}

export async function belongsToCluster(client: GlideClient): Promise<boolean> {
  const response = await client.info([InfoOptions.Cluster])
  const parsed = parseInfo(response)
  return parsed["cluster_enabled"] === "1"
}

export async function discoverCluster(client: GlideClient, payload: {
  connectionDetails: ConnectionDetails
  connectionId?: string;
})  {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await client.customCommand(["CLUSTER", "SLOTS"]) as any[][]
    // First primary node's ID
    const clusterId = R.path([0, 2, 2], response)

    const clusterNodes = response.reduce((acc, slotRange) => {
      const [, , ...nodes] = slotRange
      const [primaryHost, primaryPort] = nodes[0]
      const primaryKey = sanitizeUrl(`${primaryHost}-${primaryPort}`)

      if (!acc[primaryKey]) {
        acc[primaryKey] = {
          host: primaryHost,
          port: primaryPort,
          ...(payload.connectionDetails.password && {
            username: payload.connectionDetails.username,
            password: payload.connectionDetails.password,
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

      return acc
    }, {} as Record<string, {
      host: string;
      port: number;
      username?: string, 
      password?: string,
      tls: boolean,
      verifyTlsCertificate: boolean,
      replicas: { id: string; host: string; port: number }[];
    }>)

    return { clusterNodes, clusterId }
  } catch (err) {
    console.error("Error discovering cluster:", err)
    throw new Error("Failed to discover cluster") 
    
  }
}

async function connectToCluster(
  standaloneClient: GlideClient,
  ws: WebSocket,
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
  payload: { connectionDetails: ConnectionDetails, connectionId: string;},
  addresses: { host: string, port: number }[],
  credentials: ServerCredentials | undefined,
  keyEvictionPolicy: KeyEvictionPolicy,
  jsonModuleAvailable: boolean,
  clusterNodesMap: Map<string, string[]>,
) {
  const { clusterNodes, clusterId } = await discoverCluster(standaloneClient, payload)
  if (R.isEmpty(clusterNodes)) {
    throw new Error("No cluster nodes discovered")
  }
  const useTLS = payload.connectionDetails.tls

  let clusterClient 
  standaloneClient.close()

  // Check if we've already connected to this cluster before 
  const existingKey = Object.keys(clusterNodes).find(
    (key) => clients.get(key)?.client instanceof GlideClusterClient,
  )

  const existingConnection = existingKey
    ? clients.get(existingKey)
    : undefined

  if (existingConnection) {
    const { client: existingClient, clusterId: existingClusterId } = existingConnection
    clusterClient = existingClient
    clients.set(payload.connectionId, { client: existingClient, clusterId: existingClusterId })
    clusterNodesMap.get(existingClusterId!)?.push(payload.connectionId)
    subscribe(payload.connectionId, ws)
    ws.send(
      JSON.stringify({
        type: VALKEY.CLUSTER.updateClusterInfo,
        payload: { existingClusterId, clusterNodes },
      }),
    )
  } 
  else {
    ws.send(
      JSON.stringify({
        type: VALKEY.CLUSTER.addCluster,
        payload: { clusterId, clusterNodes },
      }),
    )
    clusterClient = await createClusterValkeyClient({
      addresses,
      credentials,
      useTLS,
      verifyTlsCertificate: payload.connectionDetails.verifyTlsCertificate,
    })
    clients.set(payload.connectionId, { client: clusterClient, clusterId })
    clusterNodesMap.set(clusterId, [payload.connectionId])
    subscribe(payload.connectionId, ws)
  }

  let clusterSlotStatsEnabled = false
  try {
    await clusterClient.customCommand(["CLUSTER", "SLOT-STATS", "SLOTSRANGE", "0", "0"])
    clusterSlotStatsEnabled = true
  } catch {
    console.warn("Cluster slot-stats is not enabled.")
  }

  const clusterConnectionInfo = {
    type: VALKEY.CONNECTION.clusterConnectFulfilled,
    payload: {
      connectionId: payload.connectionId,
      clusterNodes,
      clusterId: existingConnection ? existingConnection.clusterId : clusterId,
      address: { host: Object.values(clusterNodes)[0].host, port: Object.values(clusterNodes)[0].port },
      credentials,
      keyEvictionPolicy,
      clusterSlotStatsEnabled,
      jsonModuleAvailable,
    },
  }

  ws.send(
    JSON.stringify(clusterConnectionInfo),
  )
  return clusterClient
}

export async function isDuplicateConnection(
  payload:{connectionId: string, connectionDetails: ConnectionDetails}, 
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
) 
{
  const { connectionId, connectionDetails } = payload
  const resolvedAddresses = (await resolveHostnameOrIpAddress(connectionDetails.host)).addresses
  // Prevent duplicate connections: 
  // 1) True if any resolved host:port is already connected
  // 2) Or if this connectionId already exists as a standalone connection
  return (resolvedAddresses.some((address) => clients.has(sanitizeUrl(`${address}:${connectionDetails.port}`))) || 
  (clients.has(connectionId) && clients.get(connectionId)?.client instanceof GlideClient))
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
) {
  if (process.env.USE_CLUSTER_ORCHESTRATOR !== "true") {
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
  }
}
