import { type WebSocket } from "ws"
import { VALKEY, type MonitorAction } from "valkey-common"
import { withDeps, Deps, fetchWithTimeout } from "./utils"

type MonitorResponse = {
  monitorRunning: boolean
  checkAt: number | null
  error?: string
}

const sendMonitorFulfilled = (
  ws: WebSocket,
  connectionId: string,
  parsedResponse: MonitorResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.MONITOR.monitorFulfilled,
      payload: {
        connectionId,
        parsedResponse,
      },
    }),
  )
}

const sendMonitorError = (
  ws: WebSocket,
  connectionId: string,
  error: unknown,
) => {
  console.error(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.MONITOR.monitorError,
      payload: {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      },
    }),
  )
}

export const monitorRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, action, clusterNodesMap }) => {
    const { connectionId, clusterId, monitorAction } = action.payload
    const connectionIds = clusterId ? clusterNodesMap.get(clusterId as string) ?? [] : [connectionId]

    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerMap.get(connectionId)?.metricsURI

      if (!metricsServerURI) {
        sendMonitorError(ws, connectionId, new Error("Metrics server URI not found"))
        return
      }

      try {
        const url = `${metricsServerURI}/monitor?action=${monitorAction as MonitorAction}`

        console.debug(`[Monitor] ${monitorAction} request to:`, url)
        const response = await fetchWithTimeout(url)
        const parsedResponse: MonitorResponse = await response.json() as MonitorResponse

        if (!response.ok) {
          sendMonitorError(ws, connectionId, new Error(parsedResponse.error ?? `HTTP ${response.status}`))
          return
        }

        sendMonitorFulfilled(ws, connectionId, parsedResponse)
      } catch (error) {
        sendMonitorError(ws, connectionId, error)
      }
    })
    await Promise.all(promises)
  })
