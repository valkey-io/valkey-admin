import { type WebSocket } from "ws"
import { VALKEY, type MonitorAction, type NodeReplyId, toNodeId } from "valkey-common"
import { withDeps, type Deps, fetchWithTimeout } from "./utils"
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

