import { type WebSocket } from "ws"
import { VALKEY, toNodeId, buildUrl, MILLISECONDS_IN_AN_HOUR } from "valkey-common"
import { withDeps, Deps, fetchWithTimeout } from "./utils"

interface MemoryMetric {
  description: string
  series: Array<{
    timestamp: number
    value: number
  }>
}

type MemoryUsageResponse = {
  [key: string]: MemoryMetric
}

const sendMemoryUsageFulfilled = (
  ws: WebSocket,
  nodeId: string,
  parsedResponse: MemoryUsageResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.MEMORY.memoryUsageFulfilled,
      payload: {
        nodeId,
        parsedResponse,
      },
    }),
  )
}

const sendMemoryUsageError = (
  ws: WebSocket,
  nodeId: string,
  error: unknown,
) => {
  console.error(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.MEMORY.memoryUsageError,
      payload: {
        nodeId,
        error: error instanceof Error ? error.message : String(error),
      },
    }),
  )
}

type RequestPayload = {
  connectionId: string,
  clusterId: string,
  timeRange?: number
}

export const memoryUsageRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, action, connectedNodesByCluster }) => {
    const { connectionId, clusterId, timeRange = 12 * MILLISECONDS_IN_AN_HOUR } = action.payload as unknown as RequestPayload
    const connectionIds = clusterId ? connectedNodesByCluster.get(clusterId as string) ?? [] : [connectionId]
    const promises = connectionIds.map(async (connectionId: string) => {
      // metricsServerMap is keyed by metrics-node-id.
      // Idempotent on the cluster-fan-out path where ids already lack `-db`.
      const nodeId = toNodeId(connectionId)
      const metricsServerURI = metricsServerMap.get(nodeId)?.metricsURI

      if (!metricsServerURI) {
        sendMemoryUsageError(ws, nodeId, new Error("Metrics server URI not found"))
        return
      }

      try {
        const since = Date.now() - timeRange

        const url = buildUrl(metricsServerURI, "/memory", { since, maxPoints: 60 })

        const response = await fetchWithTimeout(url)
        const parsedResponse: MemoryUsageResponse = await response.json() as MemoryUsageResponse

        sendMemoryUsageFulfilled(ws, nodeId, parsedResponse)
      } catch (error) {
        sendMemoryUsageError(ws, nodeId, error)
      }
    })
    await Promise.all(promises)
  })
