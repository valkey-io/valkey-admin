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
  async ({ ws, metricsServerMap, action, clusterNodesRegistry }) => {
    const { connectionId, clusterId, monitorAction } = action.payload

    let connectionIds: string[]
    let resolvedAction: MonitorAction
    if (monitorAction === "stop_all") {
      // Stop all nodes the backend knows about, regardless of frontend state.
      // This makes sure monitors started by other clients or missed by the frontend are also stopped.
      connectionIds = Array.from(metricsServerMap.keys())
      resolvedAction = "stop"
    } else if (clusterId) {
      // for cluster nodes: fan out to all nodes in the cluster registry that have an active metrics server.
      connectionIds = Object.keys(clusterNodesRegistry[clusterId as string] ?? {}).filter((id) => metricsServerMap.has(id))
      resolvedAction = monitorAction as MonitorAction
    } else {
      // Standalone start/status: act on the single specified connection.
      // Standalone stop is handled by stop_all above.
      connectionIds = [connectionId]
      resolvedAction = monitorAction as MonitorAction
    }

    const promises = connectionIds.map(async (connectionId: string) => {
      const metricsServerURI = metricsServerMap.get(connectionId)?.metricsURI

      if (!metricsServerURI) {
        sendMonitorError(ws, connectionId, new Error("Metrics server URI not found"))
        return
      }

      try {
        const url = `${metricsServerURI}/monitor?action=${resolvedAction}`

        console.debug(`[Monitor] ${resolvedAction} request to:`, url)
        const response = await fetchWithTimeout(url)
        const parsedResponse: MonitorResponse = await response.json() as MonitorResponse

        if (!response.ok) {
          sendMonitorError(ws, connectionId, new Error(parsedResponse.error ?? `HTTP ${response.status}`))
          return
        }

        sendMonitorFulfilled(ws, connectionId, parsedResponse)

        if (resolvedAction === "start" || resolvedAction === "stop") {
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
  async ({ ws, clients, connectionId, metricsServerMap, connectedNodesByCluster, clusterNodesRegistry, action }) => {
    const deps: Deps = { ws, clients, connectionId, metricsServerMap, connectedNodesByCluster, clusterNodesRegistry }
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
