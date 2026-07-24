import { type WebSocket } from "ws"
import {
  VALKEY,
  type AggregateReplyId,
  type NodeResultsReply,
  toNodeId
} from "valkey-common"
import { Deps, withDeps, fetchWithTimeout, safeSend, type ReduxAction } from "./utils"
import { toOutcome, type CollectionResult } from "./node-fanout"
import { runWithRetry, type RetryRunResult, type NodeStatusUpdate } from "./retry-runner"
import { monitorRequested } from "./monitorAction"

interface ParsedResponse  {
  success: boolean, 
  statusCode?: number,
  message: string, 
  data: object
}

/**
 * In-flight config retry sessions, keyed by target id (`clusterId` for a
 * cluster, db-less `nodeId` for standalone).
 */
const configSessions = new Map<string, { controller: AbortController; ws: WebSocket }>()

/**
 * Config-feature retry overrides, resolved at call time so env changes apply
 * per session. The retry runner itself is policy-agnostic; these env vars
 * belong to the config update feature and are translated into plain runner
 * options here. Absent/invalid values fall through to the runner defaults.
 */
const resolveConfigRetryOverrides = (): { maxRetries?: number; delaysMs?: readonly number[] } => {
  const envRetries = Number(process.env.CONFIG_RETRY_MAX_RETRIES)
  const envDelays = process.env.CONFIG_RETRY_DELAYS_MS
    ?.split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0)
  return {
    maxRetries: Number.isInteger(envRetries) && envRetries >= 0 ? envRetries : undefined,
    delaysMs: envDelays?.length ? envDelays : undefined,
  }
}

/**
 * POST the config to a single node's metrics process and return its outcome
 * as a `NodeResult` (`{ success, message }`).
 */
async function postConfigToNode(
  metricsServerURI: string | undefined,
  config: unknown,
  signal?: AbortSignal,
): Promise<{ success: boolean; message: string }> {
  if (!metricsServerURI) {
    return { success: false, message: "Metrics server URI not found" }
  }
  try {
    const url = new URL("/update-config", metricsServerURI)
    const response = await fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }, undefined, signal)
    const parsed = await response.json() as ParsedResponse
    return { success: Boolean(parsed.success), message: parsed.message }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Abort every in-flight config session started from `ws`.
 */
export const abortConfigSessionsForSocket = (ws: WebSocket): void => {
  Array.from(configSessions)
    .filter(([, session]) => session.ws === ws)
    .forEach(([targetId, session]) => {
      session.controller.abort()
      configSessions.delete(targetId)
    })
}

/**
 * Run the per-node config push for one update (with automatic per-node retry
 * and backoff (`runWithRetry`)) pushing a live `updateConfigNodeStatus` for
 * every node transition, and send the aggregate Config_Reply when the session
 * resolves.
 *
 * A new request for the same target id aborts the in-flight
 * session synchronously (before any await) and suppresses its aggregate
 * reply, so at most one session per target is live and exactly one final
 * reply reaches the frontend.
 */
export const runConfigPushSession = withDeps<Deps, RetryRunResult>(
  async ({ ws, metricsServerMap, action, clusterNodesRegistry }) => {
    const { connectionId, clusterId, config } = action.payload

    const replyId: AggregateReplyId =
      typeof clusterId === "string" ? { clusterId } : { nodeId: toNodeId(connectionId) }
    const targetId = "clusterId" in replyId ? replyId.clusterId : replyId.nodeId

    const targetNodeIds =
      typeof clusterId === "string" ? Object.keys(clusterNodesRegistry[clusterId] ?? {}) : [targetId]
    const targets = targetNodeIds.map((nodeId) => ({
      nodeId,
      metricsURI: metricsServerMap.get(nodeId)?.metricsURI,
    }))

    // Supersede any in-flight session for this target.
    configSessions.get(targetId)?.controller.abort()
    const controller = new AbortController()
    configSessions.set(targetId, { controller, ws })

    const onNodeStatusUpdate = (update: NodeStatusUpdate): void => {
      safeSend(ws, JSON.stringify({
        type: VALKEY.CONFIG.updateConfigNodeStatus,
        payload: { ...replyId, ...update },
      }))
    }

    try {
      const result = await runWithRetry(
        targets,
        (t, signal) => postConfigToNode(t.metricsURI, config, signal),
        { ...resolveConfigRetryOverrides(), signal: controller.signal, onNodeStatusUpdate },
      )
      // A superseded session must not send a stale aggregate reply over the
      // newer session's outcome.
      if (!result.aborted) {
        sendConfigReply(ws, replyId, result, config)
      }
      return result
    } finally {
      if (configSessions.get(targetId)?.controller === controller) {
        configSessions.delete(targetId)
      }
    }
  },
)

/**
 * `config/updateConfig`: push the monitoring config to every target node via
 * a retry session, then when the optional `monitorAction` rider is present,
 * start/stop MONITOR on exactly the nodes whose config push succeeded, so no
 * node samples with stale settings.
 */
export const updateConfig = withDeps<Deps, void>(
  async ({ ws, clients, connectionId, metricsServerMap, connectedNodesByCluster, clusterNodesRegistry, action }) => {
    const deps: Deps = { ws, clients, connectionId, metricsServerMap, connectedNodesByCluster, clusterNodesRegistry }
    const { config, monitorAction } = action.payload

    // Without a config there is no session to run
    if (!config) return

    // Complete the config push and collect its per-node results (sending the
    // Config_Reply) before issuing the toggle. The session reads only
    // `payload.{connectionId, clusterId, config}`.
    const configResult = await runConfigPushSession(deps)(action)

    if (configResult.aborted) return

    if (!monitorAction) return

    const succeededNodeIds = configResult.attempted.filter((r) => r.success).map((r) => r.nodeId)
    if (succeededNodeIds.length === 0) return

    const monitorSubAction: ReduxAction = {
      type: VALKEY.MONITOR.monitorRequested,
      payload: {
        connectionId: action.payload.connectionId,
        clusterId: action.payload.clusterId,
        monitorAction,
        // Restrict the toggle to the config-succeeded nodes.
        targetNodeIds: succeededNodeIds,
      },
      meta: action.meta,
    }
    await monitorRequested(deps)(monitorSubAction)
  })

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

/**
 * Derive the reply outcome from the collected per-node results and send the
 * matching websocket reply.
 */
const sendConfigReply = (
  ws: WebSocket,
  replyId: AggregateReplyId,
  result: CollectionResult,
  config: unknown,
) => {
  const outcome = toOutcome(result)

  if (outcome === "fulfilled") {
    const payload: AggregateReplyId & NodeResultsReply = {
      ...replyId,
      outcome,
      nodeResults: result.attempted,
      notAttemptedNodeIds: result.notAttempted,
      appliedConfig: config as Record<string, unknown>,
    }
    safeSend(ws, JSON.stringify({ type: VALKEY.CONFIG.updateConfigFulfilled, payload }))
    return
  }

  const payload: AggregateReplyId & NodeResultsReply = {
    ...replyId,
    outcome,
    nodeResults: result.attempted,
    notAttemptedNodeIds: result.notAttempted,
  }
  safeSend(ws, JSON.stringify({ type: VALKEY.CONFIG.updateConfigFailed, payload }))
}
