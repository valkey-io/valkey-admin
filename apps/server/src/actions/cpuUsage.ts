import { type WebSocket } from "ws"
import { VALKEY, toNodeId, buildUrl, MILLISECONDS_IN_AN_HOUR } from "valkey-common"
import { withDeps, Deps, fetchWithTimeout } from "./utils"

type CpuUsageResponse = Array<{
  timestamp: number
  value: number
}>

const sendCpuUsageFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: CpuUsageResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.CPU.cpuUsageFulfilled,
      payload: {
        connectionId,
        parsedResponse,
      },
    }),
  )
}

const sendCpuUsageError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.error(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.CPU.cpuUsageError,
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

export const cpuUsageRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, action, connectedNodesByCluster }) => {
    const { connectionId, clusterId, timeRange = 12 * MILLISECONDS_IN_AN_HOUR } = action.payload as unknown as RequestPayload
    const connectionIds = clusterId ? connectedNodesByCluster.get(clusterId as string) ?? [] : [connectionId]

    const promises = connectionIds.map(async (connectionId: string) => {
      // metricsServerMap is keyed by metrics-node-id.
      // Idempotent on the cluster-fan-out path where ids already lack `-db`.
      const metricsServerURI = metricsServerMap.get(toNodeId(connectionId))?.metricsURI

      if (!metricsServerURI) {
        sendCpuUsageError(ws, connectionId, new Error("Metrics server URI not found"))
        return
      }

      try {
        const since = Date.now() - timeRange

        const url = buildUrl(metricsServerURI, "/cpu", { since, maxPoints: 120 })

        const response = await fetchWithTimeout(url)
        const parsedResponse: CpuUsageResponse = await response.json() as CpuUsageResponse

        sendCpuUsageFulfilled(ws, connectionId, parsedResponse)
      } catch (error) {
        sendCpuUsageError(ws, connectionId, error)
      }
    })
    await Promise.all(promises)
  })
