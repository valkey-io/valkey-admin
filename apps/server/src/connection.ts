import { GlideClient, GlideClusterClient, InfoOptions, ServerCredentials, ServiceType } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "valkey-common"
import { sanitizeUrl } from "valkey-common"
import { 
  clusterClientExists, 
  connectToFirstNode, 
  getClusterSlotStatsEnabled, 
  getKeyEvictionPolicy, 
  parseInfo, 
  resolveHostnameOrIpAddress, 
  returnExistingClusterClient } from "./utils"
import { checkJsonModuleAvailability } from "./check-json-module"
import { type ConnectionDetails } from "./actions/connection"
import { MetricsServerMap, startMetricsServer } from "./metrics-orchestrator"
import { subscribe } from "./node-watchers"
import { createClusterValkeyClient, createStandaloneValkeyClient } from "./valkey-client"

export async function connectToValkey(
  ws: WebSocket,
  payload: {
    connectionDetails: ConnectionDetails
    connectionId: string
    isRetry?: boolean
  },
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string }>,
  clusterNodesMap: Map<string, string[]>,
  metricsServerMap: MetricsServerMap,
) {
  
  const { 
    host, port, username, password, tls: useTLS, 
    verifyTlsCertificate, endpointType, authType, awsRegion, awsReplicationGroupId,
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
      if (existing && existing.client instanceof GlideClient) {
        try { existing.client.close() } catch (error) {
          console.error(`Error closing stale client for ${connectionId}:`, error)
        }
        clients.delete(connectionId)
      }
    }
    // If we've connected to the same host using IP addr or vice versa, return
    if (await isDuplicateConnection(payload, clients)) {
      return ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: { connectionId, errorMessage: "This is a duplicate connection, please use a new endpoint." },
        }),
      )
    }

    if (endpointType === "cluster-endpoint") {
      return connectToCluster(
        ws, 
        clients, 
        payload, 
        addresses, 
        credentials, 
        clusterNodesMap,
        metricsServerMap,
      )
    }

    const standaloneClient = await createStandaloneValkeyClient({
      addresses,
      credentials,
      useTLS,
      verifyTlsCertificate,
    })
    clients.set(connectionId, { client: standaloneClient })
    
    // In cluster-orchestrator mode, metrics sidecars register themselves.
    if (process.env.USE_CLUSTER_ORCHESTRATOR !== "true" && !metricsServerMap.has(payload.connectionId)) {
      await startMetricsServer(payload.connectionDetails, payload.connectionId)
    }

    const keyEvictionPolicy = await getKeyEvictionPolicy(standaloneClient)
    const jsonModuleAvailable = await checkJsonModuleAvailability(standaloneClient)
    
    if (await belongsToCluster(standaloneClient)) {
      standaloneClient.close()
      clients.delete(connectionId)
      return connectToCluster(
        ws, 
        clients, 
        payload, 
        addresses, 
        credentials, 
        clusterNodesMap,
        metricsServerMap,
      )
    }

    const connectionInfo = {
      type: VALKEY.CONNECTION.standaloneConnectFulfilled,
      payload: {
        connectionId,
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

export async function belongsToCluster(client: GlideClient): Promise<boolean> {
  const response = await client.info([InfoOptions.Cluster])
  const parsed = parseInfo(response)
  return parsed["cluster_enabled"] === "1"
}

export async function discoverCluster(client: GlideClient | GlideClusterClient, payload: {
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
          ...(payload.connectionDetails.authType === "iam"
            ? {
              username: payload.connectionDetails.username,
              authType: "iam" as const,
              awsRegion: payload.connectionDetails.awsRegion,
              awsReplicationGroupId: payload.connectionDetails.awsReplicationGroupId,
            }
            : payload.connectionDetails.password && {
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

export async function connectToCluster(
  ws: WebSocket,
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
  payload: { connectionDetails: ConnectionDetails, connectionId: string, isRetry?: boolean},
  addresses: { host: string, port: number }[],
  credentials: ServerCredentials | undefined,
  clusterNodesMap: Map<string, string[]>,
  metricsServerMap: MetricsServerMap,
  configEndpointId?: string,
): Promise<GlideClusterClient | undefined> {
  const { connectionId } = payload
  const { verifyTlsCertificate, tls: useTLS } = payload.connectionDetails
  try {
    const CONNECTION_TIMEOUT_MS = 10000
    let clusterClient = await Promise.race([
      createClusterValkeyClient({ addresses, credentials, useTLS, verifyTlsCertificate }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out")), CONNECTION_TIMEOUT_MS),
      ),
    ])
    
    // TODO: Optimize to not call discoverCluster when configEndpointId is available
    // It implies we already discovered cluster nodes once
    const { clusterNodes, clusterId: initialClusterId } = await discoverCluster(clusterClient, payload)
    let clusterId = initialClusterId
    if (Object.keys(clusterNodes).length < 3) {
      try { clusterClient.close() } catch (error) {
        console.error(`Error closing stale client for ${connectionId}:`, error)
      }
      throw new Error("Unable to discover cluster")
    }
    const useClusterEndpoint = payload.connectionDetails.endpointType === "cluster-endpoint"
    // Reconnect using a real node address instead of the clustercfg endpoint
    if (useClusterEndpoint) {
      return await connectToFirstNode(
        clusterClient,
        clusterNodes,
        ws,
        clients,
        clusterNodesMap,
        payload,
      )
    }

    const existingClusterConnection = await clusterClientExists(clusterNodes, clients)
    if (existingClusterConnection) {
      clusterId = existingClusterConnection.clusterId
      if (payload.isRetry) {
        // Find cluster nodes that share same client
        const sharedIds = [...clients.entries()]
          .filter(([, entry]) => entry.client === existingClusterConnection.client)
          .map(([id]) => id)

        try { existingClusterConnection.client.close() } catch (error) {
          console.error(`Error closing stale client for ${connectionId}:`, error)
        }
        // Update map with new client
        sharedIds.forEach((id) => clients.set(id, { client: clusterClient, clusterId }))
      }
      else {
        // Close the client we used to discover 
        clusterClient.close()
        clusterClient = 
          await returnExistingClusterClient(
            existingClusterConnection,
            clients,
            payload.connectionId, 
            clusterNodesMap, 
            ws,
            clusterNodes,
          )
      }
    } 
    else {
      clusterId = configEndpointId ?? clusterId
      ws.send(
        JSON.stringify({
          type: VALKEY.CLUSTER.addCluster,
          payload: { clusterId, clusterNodes }, //TODO: strip credentials (this will impact connecting from Cluster Topology)
        }),
      )
      clients.set(connectionId, { client: clusterClient, clusterId })
      clusterNodesMap.set(clusterId, [connectionId])
      subscribe(payload.connectionId, ws)
    }

    const clusterSlotStatsEnabled = await getClusterSlotStatsEnabled(clusterClient)
    const keyEvictionPolicy = await getKeyEvictionPolicy(clusterClient)
    const jsonModuleAvailable = await checkJsonModuleAvailability(clusterClient)

    // If configEndpointId is available, it means user is connecting using discovery endpoint
    if (configEndpointId) {
      const nodeConnectionId = sanitizeUrl(`${payload.connectionDetails.host}-${payload.connectionDetails.port}`)
      clients.set(nodeConnectionId, { client: clusterClient, clusterId })
      if (!clusterNodesMap.get(clusterId)?.includes(nodeConnectionId)) clusterNodesMap.get(clusterId)?.push(nodeConnectionId)
      if (!metricsServerMap.has(connectionId)) await startMetricsServer(payload.connectionDetails, connectionId)
      // Add connectedNode to payload 
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.clusterConnectFulfilled,
          payload: {
            connectionId,
            connectedNode: addresses[0],
            connectionDetails: {
              clusterId,
              keyEvictionPolicy,
              clusterSlotStatsEnabled,
              jsonModuleAvailable,
            },
          },
        }),
      )
      return clusterClient
    }
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.clusterConnectFulfilled,
        payload: {
          connectionId: payload.connectionId,
          connectionDetails: {
            clusterId,
            keyEvictionPolicy,
            clusterSlotStatsEnabled,
            jsonModuleAvailable,
          },
        },
      }),
    )
    return clusterClient
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

export async function isDuplicateConnection(
  payload:{connectionId: string, connectionDetails: ConnectionDetails, isRetry?: boolean}, 
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
) 
{
  const { connectionId, connectionDetails } = payload
  // If the frontend is retrying a broken connection, it's not a duplicate
  if (payload.isRetry) {
    return false
  }

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
