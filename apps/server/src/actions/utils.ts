import { type GlideClient, type GlideClusterClient } from "@valkey/valkey-glide"
import type WebSocket from "ws"

export type Deps = {
  ws: WebSocket
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>
  connectionId: string,
  metricsServerURIs: Map<string, string>,
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
    console.log("Unknown action type:", action.type)
  }
