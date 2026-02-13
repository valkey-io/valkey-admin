import { GlideClient, GlideClusterClient, InfoOptions, ServerCredentials } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "../../../common/src/constants"
import { parseInfo, resolveHostnameOrIpAddress } from "./utils"
import { sanitizeUrl } from "../../../common/src/url-utils.ts"
import { type KeyEvictionPolicy } from "../../../common/src/constants"
import { checkJsonModuleAvailability } from "./check-json-module.ts"
import { type ConnectionDetails } from "./actions/connection.ts"

export async function connectToValkey(
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string;
  },
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string }>,
  clusterNodesMap: Map<string, string[]>,
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
    await returnIfDuplicateConnection(payload, clients, ws)
    const useTLS = payload.connectionDetails.tls
    const standaloneClient = await GlideClient.createClient({
      addresses,
      credentials,
      useTLS,
      ...(useTLS && payload.connectionDetails.verifyTlsCertificate === false && {
        advancedConfiguration: {
          tlsAdvancedConfiguration: {
            insecure: true,
          },
        },
      }),

      requestTimeout: 5000,
      clientName: "test_client",
    })
    clients.set(payload.connectionId, { client: standaloneClient })
    
    const evictionPolicyResponse = await standaloneClient.customCommand(["CONFIG", "GET", "maxmemory-policy"]) as [{key: string, value: string}]
    const keyEvictionPolicy: KeyEvictionPolicy = evictionPolicyResponse[0].value.toLowerCase() as KeyEvictionPolicy
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
        clusterNodesMap)
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
    // Send standalone details if node isn't part of a cluster
    process.send?.(connectionInfo)
    console.log("Connected to standalone")

    ws.send(
      JSON.stringify(connectionInfo),
    )
    return standaloneClient

  } catch (err) {
    console.log("Error connecting to Valkey", err)
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

async function belongsToCluster(client: GlideClient): Promise<boolean> {
  const response = await client.info([InfoOptions.Cluster])
  const parsed = parseInfo(response)
  return parsed["cluster_enabled"] === "1"
}

async function discoverCluster(client: GlideClient, payload: {
  connectionDetails: ConnectionDetails
  connectionId: string;
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
  await standaloneClient.customCommand(["CONFIG", "SET", "cluster-announce-hostname", addresses[0].host])
  const { clusterNodes, clusterId } = await discoverCluster(standaloneClient, payload)
  if (R.isEmpty(clusterNodes)) {
    throw new Error("No cluster nodes discovered")
  }
  const useTLS = payload.connectionDetails.tls

  let clusterClient 
  standaloneClient.close()

  const existingKey = Object.keys(clusterNodes).find(
    (key) => clients.get(key) instanceof GlideClusterClient,
  )

  const existingConnection = existingKey
    ? clients.get(existingKey)
    : undefined

  if (existingConnection) {
    const { client: existingClient, clusterId: existingClusterId } = existingConnection
    clusterClient = existingClient
    clients.set(payload.connectionId, { client: existingClient, clusterId: existingClusterId })
    clusterNodesMap.get(existingClusterId!)?.push(payload.connectionId)
  } 
  else {
    ws.send(
      JSON.stringify({
        type: VALKEY.CLUSTER.addCluster,
        payload: { clusterId, clusterNodes },
      }),
    )
    clusterClient = await GlideClusterClient.createClient({
      addresses,
      credentials,
      useTLS,
      ...(useTLS && payload.connectionDetails.verifyTlsCertificate === false && {
        advancedConfiguration: {
          tlsAdvancedConfiguration: {
            insecure: true,
          },
        },
      }),
      requestTimeout: 5000,
      clientName: "cluster_client",
    })
    clients.set(payload.connectionId, { client: clusterClient, clusterId })
    clusterNodesMap.set(clusterId, [payload.connectionId])
  }

  const clusterSlotStatsResponse = await clusterClient.customCommand(
    ["CONFIG", "GET", "cluster-slot-stats-enabled"],
  ) as [Record<string, string>]
  const clusterSlotStatsEnabled = clusterSlotStatsResponse[0].value === "yes" 

  const clusterConnectionInfo = {
    type: VALKEY.CONNECTION.clusterConnectFulfilled,
    payload: {
      connectionId: payload.connectionId,
      clusterNodes,
      clusterId,
      address: addresses[0],
      credentials,
      keyEvictionPolicy,
      clusterSlotStatsEnabled,
      jsonModuleAvailable,
    },
  }

  process.send?.(clusterConnectionInfo)

  ws.send(
    JSON.stringify(clusterConnectionInfo),
  )
  return clusterClient
}

export async function returnIfDuplicateConnection(
  payload:{connectionId: string, connectionDetails: ConnectionDetails}, 
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
  ws: WebSocket) 
{
  const { connectionId, connectionDetails } = payload
  const resolvedAddresses = (await resolveHostnameOrIpAddress(connectionDetails.host)).addresses
  // Prevent duplicate connections: 
  // 1) Block if any resolved host:port is already connected
  // 2) Or if this connectionId already exists as a standalone (GlideClient) connection
  if (resolvedAddresses.some((address) => clients.has(sanitizeUrl(`${address}:${connectionDetails.port}`)))
      || (clients.has(connectionId) && clients.get(connectionId) instanceof GlideClient))  {
    return ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.standaloneConnectFulfilled,
        payload: { connectionId },
      }),
    )
  }
}

export async function closeMetricsServer(connectionId: string, metricsServerURIs: Map<string, string>) {
  const metricsServer = metricsServerURIs.get(connectionId)
  if (metricsServer) {
    const res = await fetch(`${metricsServer}/connection/close`, { method: "POST", body: JSON.stringify({ connectionId }) })
    if (res.ok) console.log(`Connection ${connectionId} closed successfully`)
    else console.warn("Could not kill metrics server process")
  }
}

export async function closeClient(
  connectionId: string,
  client: GlideClient | GlideClusterClient | undefined,
  ws: WebSocket,
)  {
  if (client) {
    try {
      client.close()
      return ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.closeConnectionFulfilled,
          payload: { connectionId },
        }),
      )
    } catch (err) {
      return ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.closeConnectionFailed,
          payload: { connectionId, errorMessage: err instanceof Error ? err.message : String(err) },
        }),
      )
    }
  }
 
}
