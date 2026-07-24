import { type GlideClient, type GlideClusterClient } from "@valkey/valkey-glide"
import { FETCH_TIMEOUT_MS } from "valkey-common"
import { ClusterRegistry, MetricsServerMap } from "../metrics-orchestrator"
import type WebSocket from "ws"

export type Deps = {
  ws: WebSocket
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>
  connectionId: string,
  metricsServerMap: MetricsServerMap,
  connectedNodesByCluster: Map<string, string[]>,
  clusterNodesRegistry: ClusterRegistry,
  sessionId?: string,
}

export type ReduxAction = {
  type: string
  payload: {
    connectionId: string
    [k: string]: unknown
  },
  meta: unknown
}

export type WsActionMessage = {
  payload: { connectionId: string },
  type: string
}

// most actions need ws, clients, connectionId before they can process a redux action
export const withDeps =
  <D, R>(fn: (ctx: D & { action: ReduxAction }) => R | Promise<R>) =>
    (deps: D) =>
      async (action: ReduxAction): Promise<Awaited<R>> => {
        return await fn({ ...deps, action })
      }

export type Handler = (deps: Deps) => (action: ReduxAction) => Promise<void>

export const unknownHandler: Handler = () =>
  async (action: { type: string }) => {
    console.warn("Unknown action type:", action.type)
  }

/**
 * Send a serialized websocket message only when the socket is still open; a
 * closed socket drops the message (with a warning) instead of throwing. Use
 * for replies emitted after an await, where the client may have disconnected
 * mid-operation (e.g. during a long-running retry session).
 */
export const safeSend = (ws: WebSocket, message: string): void => {
  if (ws.readyState === ws.OPEN) {
    ws.send(message)
  } else {
    // Expected race, not a failure: the client can close mid-operation.
    console.warn(`[safeSend] Dropped message: websocket is not open (readyState ${ws.readyState})`)
  }
}

/**
 * Fetch with a timeout, optionally composed with an external abort signal so
 * a caller-side cancellation (e.g. an aborted retry session or an expired
 * per-attempt bound) tears down the underlying request instead of leaving it
 * running in the background.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal

  try {
    const response = await fetch(url, {
      ...options,
      signal: combinedSignal,
    })
    return response
  } finally {
    clearTimeout(timeout)
  }
}
