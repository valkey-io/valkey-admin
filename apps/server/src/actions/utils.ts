import { type GlideClient, type GlideClusterClient } from "@valkey/valkey-glide"
import { FETCH_TIMEOUT_MS } from "valkey-common"
import { MetricsServerMap } from "../metrics-orchestrator"
import type WebSocket from "ws"

export type Deps = {
  ws: WebSocket
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>
  connectionId: string,
  metricsServerMap: MetricsServerMap,
  clusterNodesMap: Map<string, string[]>,
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

// Helper function to add timeout to fetch requests
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeout)
  }
}
