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
  connectionId: string,
  parsedResponse: MemoryUsageResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.MEMORY.memoryUsageFulfilled,
      payload: {
        connectionId,
        parsedResponse,
      },
    }),
  )
}

const sendMemoryUsageError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.error(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.MEMORY.memoryUsageError,
      payload: {
        connectionId,
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
      const metricsServerURI = metricsServerMap.get(toNodeId(connectionId))?.metricsURI

      if (!metricsServerURI) {
        sendMemoryUsageError(ws, connectionId, new Error("Metrics server URI not found"))
        return
      }

      try {
        const since = Date.now() - timeRange

        const url = buildUrl(metricsServerURI, "/memory", { since, maxPoints: 60 })

        const response = await fetchWithTimeout(url)
        const parsedResponse: MemoryUsageResponse = await response.json() as MemoryUsageResponse

        sendMemoryUsageFulfilled(ws, connectionId, parsedResponse)
      } catch (error) {
        sendMemoryUsageError(ws, connectionId, error)
      }
    })
    await Promise.all(promises)
  })
