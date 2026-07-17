import { type WebSocket } from "ws"
import { VALKEY, type MonitorAction, type NodeReplyId, toNodeId } from "valkey-common"
import { withDeps, type Deps, fetchWithTimeout, type ReduxAction } from "./utils"
import { runConfigPushSession } from "./config"
import { getOtherWatchers } from "../node-watchers"

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
    // Internal restriction used by the save flow to toggle only the nodes
    // whose config push succeeded.
    const restrictToNodeIds = action.payload.targetNodeIds as string[] | undefined

    if (typeof clusterId === "string") {
      const allNodeIds = Object.keys(clusterNodesRegistry[clusterId] ?? {})
      const targetNodeIds = restrictToNodeIds
        ? allNodeIds.filter((id) => restrictToNodeIds.includes(id))
        : allNodeIds
      const registered = targetNodeIds.filter((id) => metricsServerMap.has(id))
      await Promise.all(registered.map((nodeId) =>
        runMonitorForNode(ws, metricsServerMap.get(nodeId)?.metricsURI, monitorAction, { clusterId, nodeId }, nodeId),
      ))
    } else {
      // Standalone path. Monitor state is keyed by the db-less nodeId, so the
      // reply carries { nodeId }.
      const nodeId = toNodeId(connectionId)
      await runMonitorForNode(ws, metricsServerMap.get(nodeId)?.metricsURI, monitorAction, { nodeId }, connectionId)
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

    // No config to push: run the monitor toggle as before.
    if (!config) {
      if (monitorAction) {
        await monitorRequested(deps)(buildMonitorSubAction(action, monitorAction))
      }
      return
    }

    // Config present: complete the config push and collect its per-node
    // results (sending the Config_Reply) before issuing the toggle.
    const configSubAction: ReduxAction = {
      type: VALKEY.CONFIG.updateConfig,
      payload: { connectionId: action.payload.connectionId, clusterId: action.payload.clusterId, config },
      meta: action.meta,
    }
    const configResult = await runConfigPushSession(deps)(configSubAction)

    // A superseding request took over this target mid-session: its save flow
    // owns the toggle decision now.
    if (configResult.aborted) return

    if (!monitorAction) return

    // Gate the toggle on the config outcome: issue it only to the nodes whose
    // config push succeeded, and skip it entirely on total config failure.
    const succeededNodeIds = configResult.attempted.filter((r) => r.success).map((r) => r.nodeId)
    if (succeededNodeIds.length === 0) return

    await monitorRequested(deps)(buildMonitorSubAction(action, monitorAction, succeededNodeIds))
  })

/**
 * Build the monitor sub-action for the combined save flow. When
 * `restrictNodeIds` is provided, the toggle is restricted to those nodes via
 * `targetNodeIds`, so only the config-succeeded nodes are toggled.
 */
const buildMonitorSubAction = (
  action: ReduxAction,
  monitorAction: unknown,
  restrictNodeIds?: string[],
): ReduxAction => ({
  type: VALKEY.MONITOR.monitorRequested,
  payload: {
    connectionId: action.payload.connectionId,
    clusterId: action.payload.clusterId,
    monitorAction,
    ...(restrictNodeIds ? { targetNodeIds: restrictNodeIds } : {}),
  },
  meta: action.meta,
})
