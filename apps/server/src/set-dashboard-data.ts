import * as R from "ramda"
import { GlideClusterClient, ConnectionError, ClosingError, TimeoutError } from "@valkey/valkey-glide"
import WebSocket from "ws"
import { VALKEY, METRICS_SERVER_NOT_READY, buildUrl } from "valkey-common"
import { type ParsedClusterInfo, parseClusterInfo } from "./utils"
import { computeClusterUtilization, type NodeUtilization } from "./node-utilization"
import { fetchWithTimeout } from "./actions/utils"
import { discoverCluster } from "./connection"
import { type ConnectionDetails } from "./actions/connection"
import {
  isWebMode,
  metricsServerMap,
  reconcileClusterMetricsServers,
  type ClusterNodeMap
} from "./metrics-orchestrator"

type DashboardInfo = {
  info: Record<string, string>
  memory: Record<string, string>
}

const sendSetDataFulfilled = (
  ws: WebSocket,
  connectionId: string,
  { info, memory }: DashboardInfo,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.STATS.setData,
      payload: {
        connectionId,
        info,
        memory,
      },
    }),
  )
}

const sendSetDataError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
  errorKind?: string, // distinguish "not ready yet" from "real error" for better UI handling
) => {
  // The metrics server registers a moment after connect, so an early stats request
  // expectedly finds no URI. The frontend retries up to METRICS_MAX_RETRIES and surfaces
  // the error itself, so logging a stack trace here is just noise. Real failures still log.
  if (errorKind !== METRICS_SERVER_NOT_READY) console.error(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.STATS.setError,
      payload: {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
        errorKind,
      },
    }),
  )
}

export async function setDashboardData(
  connectionId: string,
  metricsServerURI: string | undefined,
  ws: WebSocket,
) {
  if (!metricsServerURI) {
    sendSetDataError(ws, connectionId, new Error("Metrics server URI not found"), METRICS_SERVER_NOT_READY)
    return
  }

  try {
    const response = await fetchWithTimeout(buildUrl(metricsServerURI, "/info"))
    if (!response.ok) {
      throw new Error(`Metrics server responded with ${response.status}`)
    }
    const parsedResponse = (await response.json()) as DashboardInfo

    sendSetDataFulfilled(ws, connectionId, parsedResponse)
  } catch (error) {
    sendSetDataError(ws, connectionId, error)
  }
}

// Never let utilization math break the dashboard payload.
const safeComputeClusterUtilization = (
  clusterInfo: ParsedClusterInfo,
): Record<string, NodeUtilization> => {
  try {
    return computeClusterUtilization(clusterInfo)
  } catch (error) {
    console.error("Unable to compute cluster utilization:", error)
    return {}
  }
}

// discoverCluster only reads the auth and TLS fields, copying them onto every rediscovered node;
// host, port, endpointType and db are placeholders required by ConnectionDetails.
const toDiscoveryDetails = (node: ClusterNodeMap[string]): ConnectionDetails => ({
  host: node.host,
  port: String(node.port),
  username: node.username,
  tls: node.tls,
  verifyTlsCertificate: node.verifyTlsCertificate,
  authType: node.authType,
  awsRegion: node.awsRegion,
  awsReplicationGroupId: node.awsReplicationGroupId,
  endpointType: "cluster-endpoint",
  db: 0,
})

const refreshClusterNodes = async (
  clusterId: string,
  client: GlideClusterClient,
  clusterNodesRegistry: Map<string, ClusterNodeMap>,
): Promise<ClusterNodeMap | undefined> => {
  const current = clusterNodesRegistry.get(clusterId)
  const template = current && Object.values(current)[0]
  if (!template) return current

  try {
    const { discoveredClusterNodes } = await discoverCluster(client, {
      connectionDetails: toDiscoveryDetails(template),
    })
    if (!R.equals<ClusterNodeMap | undefined>(discoveredClusterNodes, current)) {
      clusterNodesRegistry.set(clusterId, discoveredClusterNodes)
      if (isWebMode) reconcileClusterMetricsServers(metricsServerMap)
    }
    return discoveredClusterNodes
  } catch {
    return current
  }
}

export async function setClusterDashboardData(
  clusterId: string,
  client: GlideClusterClient,
  ws: WebSocket,
  connectionId: string,
  clusterNodesRegistry: Map<string, ClusterNodeMap>,
) {
  try {
    const [rawInfo, clusterNodes] = await Promise.all([
      client.info(),
      refreshClusterNodes(clusterId, client, clusterNodesRegistry),
    ])
    const clusterInfo = parseClusterInfo(rawInfo)

    ws.send(
      JSON.stringify({
        type: VALKEY.CLUSTER.setClusterData,
        payload: {
          clusterId,
          info: clusterInfo,
          utilization: safeComputeClusterUtilization(clusterInfo),
          clusterNodes,
        },
      }),
    )
  } catch (err) {
    if (
      err instanceof ConnectionError || err instanceof TimeoutError || err instanceof ClosingError
    ) {
      console.error(`Valkey connection error for ${connectionId}:`, err)
      ws.send(
        JSON.stringify({
          type: VALKEY.CONNECTION.connectRejected,
          payload: {
            connectionId,
            errorMessage: `Failed to fetch dashboard data: ${err.message}`,
            shouldRetry: true,
          },
        }),
      )
    }

  }

}
