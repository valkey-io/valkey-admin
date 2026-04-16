import { GlideClient, GlideClusterClient, InfoOptions, ServerCredentials, ServiceType } from "@valkey/valkey-glide"
import * as R from "ramda"
import WebSocket from "ws"
import { VALKEY } from "valkey-common"
import { sanitizeUrl } from "valkey-common"
import { 
  clusterClientExists, 
  getClusterSlotStatsEnabled, 
  getKeyEvictionPolicy, 
  parseInfo, 
  resolveHostnameOrIpAddress, 
  returnExistingClusterClient } from "./utils"
import { checkJsonModuleAvailability } from "./check-json-module"
import { type ConnectionDetails } from "./actions/connection"
import { ClusterRegistry, MetricsServerMap, startMetricsServer } from "./metrics-orchestrator"
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
  connectedNodesByCluster: Map<string, string[]>,
  metricsServerMap: MetricsServerMap,
  clusterNodesRegistry: ClusterRegistry,
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

    const standaloneClient = await createStandaloneValkeyClient({
      addresses,
      credentials,
      useTLS,
      verifyTlsCertificate,
    })
    // Need to set for metrics server to be able to register
    clients.set(connectionId, { client: standaloneClient })

    // In cluster-orchestrator mode, metrics sidecars register themselves.
    if (process.env.USE_CLUSTER_ORCHESTRATOR !== "true" && !metricsServerMap.has(payload.connectionId)) {
      await startMetricsServer(payload.connectionDetails, payload.connectionId)
    }

    const keyEvictionPolicy = await getKeyEvictionPolicy(standaloneClient)
    const jsonModuleAvailable = await checkJsonModuleAvailability(standaloneClient)
    
    if (endpointType === "cluster-endpoint" || await belongsToCluster(standaloneClient)) {
      clients.delete(connectionId)
      return connectToCluster(
        ws, 
        standaloneClient,
        clients, 
        payload, 
        addresses, 
        credentials, 
        connectedNodesByCluster,
        clusterNodesRegistry,
      )
    }

    const connectionInfo = {
      type: VALKEY.CONNECTION.standaloneConnectFulfilled,
      payload: {
        connectionId,
        connectionDetails: {
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

export async function connectToCluster(
  ws: WebSocket,
  discoveryClient: GlideClient,
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
  payload: { connectionDetails: ConnectionDetails, connectionId: string, isRetry?: boolean},
  addresses: { host: string, port: number }[],
  credentials: ServerCredentials | undefined,
  connectedNodesByCluster: Map<string, string[]>,
  clusterNodesRegistry: ClusterRegistry,
): Promise<GlideClusterClient | undefined> {

  const { connectionId } = payload
  const { verifyTlsCertificate, tls: useTLS } = payload.connectionDetails
  try {

    let clusterClient: GlideClusterClient 

    // It implies we already discovered cluster nodes once
    const { discoveredClusterNodes, clusterId: initialClusterId } = await discoverCluster(discoveryClient, payload)
    discoveryClient.close()
    let clusterId = initialClusterId
    if (Object.keys(discoveredClusterNodes).length < 1) {
      throw new Error("Unable to discover cluster")
    }
    const useClusterEndpoint = payload.connectionDetails.endpointType === "cluster-endpoint"
    if (useClusterEndpoint) {
      const firstNode = Object.values(discoveredClusterNodes)[0]
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.configEndpointRedirect,
          payload: {
            fromId: connectionId,
            toId: sanitizeUrl(`${firstNode.host}-${firstNode.port}`),
            connectionDetails: {
              ...payload.connectionDetails,
              host: firstNode.host,
              port: firstNode.port.toString(),
              endpointType: "node",
            },
          },
        }),
      )
      return undefined
    }

    const existingClusterConnection = await clusterClientExists(discoveredClusterNodes, clients)
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
        clusterClient = await createClusterValkeyClient({ addresses, credentials, useTLS, verifyTlsCertificate })
        // Update map with new client
        sharedIds.forEach((id) => clients.set(id, { client: clusterClient!, clusterId }))
      }
      else {
        clusterClient = await returnExistingClusterClient(
          existingClusterConnection,
          clients,
          payload.connectionId,
          connectedNodesByCluster,
          clusterNodesRegistry,
          ws,
          discoveredClusterNodes,
        )
      }
    } 
    else {
      clusterClient = await createClusterValkeyClient({ addresses, credentials, useTLS, verifyTlsCertificate })
      ws.send(
        JSON.stringify({
          type: VALKEY.CLUSTER.addCluster,
          payload: { clusterId, clusterNodes: discoveredClusterNodes }, 
        }),
      )
      clusterNodesRegistry[clusterId] = discoveredClusterNodes
      clients.set(connectionId, { client: clusterClient, clusterId })
      connectedNodesByCluster.set(clusterId, [connectionId])
      subscribe(payload.connectionId, ws)
    }

    const clusterSlotStatsEnabled = await getClusterSlotStatsEnabled(clusterClient)
    const keyEvictionPolicy = await getKeyEvictionPolicy(clusterClient)
    const jsonModuleAvailable = await checkJsonModuleAvailability(clusterClient)

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
          address: addresses[0],
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
