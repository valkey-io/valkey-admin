import { type WebSocket } from "ws"
import { VALKEY, type AggregateReplyId } from "valkey-common"
import { Deps, withDeps, fetchWithTimeout } from "./utils"
import { toMetricsNodeId } from "../metrics-orchestrator"

interface ParsedResponse  {
  success: boolean, 
  statusCode?: number,
  message: string, 
  data: object
}

/**
 * POST the config to a single node's metrics process and return its parsed result.
 */
async function postConfigToNode(
  metricsServerURI: string | undefined,
  config: unknown,
): Promise<ParsedResponse> {
  if (!metricsServerURI) {
    return { success: false, message: "Metrics server URI not found", data: {} }
  }
  try {
    const url = new URL("/update-config", metricsServerURI)
    const response = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    return await response.json() as ParsedResponse
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      data: error as object,
    }
  }
}

export const updateConfig = withDeps<Deps, void>(
  async ({ ws, metricsServerMap, action, clusterNodesRegistry }) => {
    const { connectionId, clusterId, config } = action.payload

    if (typeof clusterId === "string") {
      const nodeIds = Object.keys(clusterNodesRegistry[clusterId] ?? {}).filter((id) => metricsServerMap.has(id))
      const responses = await Promise.all(
        nodeIds.map((nodeId) => postConfigToNode(metricsServerMap.get(nodeId)?.metricsURI, config)),
      )
      const firstFailure = responses.find((r) => !r.success)
      if (firstFailure) {
        sendUpdateError(ws, { clusterId }, firstFailure)
      } else {
        // All nodes responses are the same so we use the first.
        sendUpdateFulfilled(ws, { clusterId }, responses[0] ?? { success: true, message: "", data: {} })
      }
      return
    }

    const nodeId = toMetricsNodeId(connectionId)
    const response = await postConfigToNode(metricsServerMap.get(nodeId)?.metricsURI, config)
    if (response.success) {
      sendUpdateFulfilled(ws, { connectionId }, response)
    } else {
      sendUpdateError(ws, { connectionId }, response)
    }
  },  
)

// TODO: Add frontend component to dispatch this
export const enableClusterSlotStats = withDeps<Deps, void>(
  async ({ clients, action, connectedNodesByCluster }) => {
    const { connectionId, clusterId } = action.payload
    const connectionIds = clusterId ? connectedNodesByCluster.get(clusterId as string) ?? [] : [connectionId]
    
    const promises = connectionIds.map(async (connectionId: string) => {
      const connection = clients.get(connectionId)
      await connection?.client?.customCommand(["CONFIG", "SET", "cluster-slot-stats-enabled", "yes"])
    })
    await Promise.all(promises)
  },
)

const sendUpdateFulfilled = (
  ws: WebSocket,
  replyId: AggregateReplyId,
  parsedResponse: ParsedResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.CONFIG.updateConfigFulfilled,
      payload: {
        ...replyId,
        response: parsedResponse,
      },
    }),
  )
}

const sendUpdateError = (
  ws: WebSocket,
  replyId: AggregateReplyId,
  parsedResponse: ParsedResponse,
) => {
  ws.send(
    JSON.stringify({
      type: VALKEY.CONFIG.updateConfigFailed,
      payload: {
        ...replyId,
        response: parsedResponse,
      },
    }),
  )
}
