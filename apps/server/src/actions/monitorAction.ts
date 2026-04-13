import { type WebSocket } from "ws"
import { VALKEY, type MonitorAction } from "valkey-common"
import { withDeps, type Deps, fetchWithTimeout, type ReduxAction } from "./utils"
import { updateConfig } from "./config"
import { getOtherWatchers } from "../node-watchers"

type MonitorResponse = {
  monitorRunning: boolean
  checkAt: number | null
  startedAt: number | null
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

        // No need to broadcast on status as no state change.
        if (monitorAction === "start" || monitorAction === "stop") {
          getOtherWatchers(connectionId, ws).forEach((watcher) => {
            sendMonitorFulfilled(watcher, connectionId, parsedResponse)
          })
        }
      } catch (error) {
        sendMonitorError(ws, connectionId, error)
      }
    })
    await Promise.all(promises)
  })

export const saveMonitorSettingsRequested = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, metricsServerMap, clusterNodesMap, action }) => {
    const deps: Deps = { ws, clients, connectionId, metricsServerMap, clusterNodesMap }
    const { config, monitorAction } = action.payload

    if (config) {
      const configSubAction: ReduxAction = {
        type: VALKEY.CONFIG.updateConfig,
        payload: { connectionId: action.payload.connectionId, clusterId: action.payload.clusterId, config },
        meta: action.meta,
      }
      await updateConfig(deps)(configSubAction)
    }

    if (monitorAction) {
      const monitorSubAction: ReduxAction = {
        type: VALKEY.MONITOR.monitorRequested,
        payload: { connectionId: action.payload.connectionId, clusterId: action.payload.clusterId, monitorAction },
        meta: action.meta,
      }
      await monitorRequested(deps)(monitorSubAction)
    }
  })
