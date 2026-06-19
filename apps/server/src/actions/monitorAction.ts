import { type WebSocket } from "ws"
import { VALKEY, type MonitorAction, type NodeReplyId } from "valkey-common"
import { withDeps, type Deps, fetchWithTimeout, type ReduxAction } from "./utils"
import { updateConfig } from "./config"
import { getOtherWatchers } from "../node-watchers"
import { toMetricsNodeId } from "../metrics-orchestrator"

type MonitorResponse = {
  monitorRunning: boolean
  checkAt: number | null
  startedAt: number | null
  error?: string
}

const sendMonitorFulfilled = (
  ws: WebSocket,
  replyId: NodeReplyId, // Monitor stores state PER NODE.
  parsedResponse: MonitorResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.MONITOR.monitorFulfilled,
      payload: {
        ...replyId,
        parsedResponse,
      },
    }),
  )
}

const sendMonitorError = (
  ws: WebSocket,
  replyId: NodeReplyId,
  error: unknown,
) => {
  console.error(error)
  ws.send(
    JSON.stringify({
      type: VALKEY.MONITOR.monitorError,
      payload: {
        ...replyId,
        error: error instanceof Error ? error.message : String(error),
      },
    }),
  )
}

export const monitorRequested = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, action, clusterNodesRegistry }) => {
    const { connectionId, clusterId, monitorAction } = action.payload

    if (typeof clusterId === "string") {
      const nodeIds = Object.keys(clusterNodesRegistry[clusterId] ?? {}).filter((id) => metricsServerMap.has(id))
      await Promise.all(nodeIds.map((nodeId) =>
        runMonitorForNode(ws, metricsServerMap.get(nodeId)?.metricsURI, monitorAction, { clusterId, nodeId }, nodeId),
      ))
    } else {
      // Standalone path
    const nodeId = toMetricsNodeId(connectionId)
    await runMonitorForNode(ws, metricsServerMap.get(nodeId)?.metricsURI, monitorAction, { connectionId }, connectionId)
    }
  })

/**
 * Issue a single node's monitor request and emit the reply.
 * @param replyId  the explicit id-space for the reply payload
 * @param watcherId the id watchers are subscribed under (db-suffixed
 *   `connectionId` on standalone, db-less `nodeId` on cluster)
 */
async function runMonitorForNode(
  ws: WebSocket,
  metricsServerURI: string | undefined,
  monitorAction: unknown,
  replyId: NodeReplyId,
  watcherId: string,
) {
  if (!metricsServerURI) {
    sendMonitorError(ws, replyId, new Error("Metrics server URI not found"))
    return
  }

  try {
    const url = `${metricsServerURI}/monitor?action=${monitorAction as MonitorAction}`

    console.debug(`[Monitor] ${monitorAction} request to:`, url)
    const response = await fetchWithTimeout(url)
    const parsedResponse: MonitorResponse = await response.json() as MonitorResponse

    if (!response.ok) {
      sendMonitorError(ws, replyId, new Error(parsedResponse.error ?? `HTTP ${response.status}`))
      return
    }

    sendMonitorFulfilled(ws, replyId, parsedResponse)

    // No need to broadcast on status as no state change.
    if (monitorAction === "start" || monitorAction === "stop") {
      getOtherWatchers(watcherId, ws).forEach((watcher) => {
        sendMonitorFulfilled(watcher, replyId, parsedResponse)
      })
    }
  } catch (error) {
    sendMonitorError(ws, replyId, error)
  }
}

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
