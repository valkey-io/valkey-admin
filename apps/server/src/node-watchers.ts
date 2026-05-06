import type WebSocket from "ws"

// connectionId → Set of WebSocket clients watching this node
const nodeWatchers: Map<string, Set<WebSocket>> = new Map()

export const subscribe = (connectionId: string, ws: WebSocket): void => {
  let watchers = nodeWatchers.get(connectionId)
  if (!watchers) {
    watchers = new Set()
    nodeWatchers.set(connectionId, watchers)
  }
  watchers.add(ws)
}

export const unsubscribe = (connectionId: string, ws: WebSocket): boolean => {
  const watchers = nodeWatchers.get(connectionId)
  if (!watchers || !watchers.delete(ws)) return false
  if (watchers.size === 0) nodeWatchers.delete(connectionId)
  return true
}

export const unsubscribeAll = (ws: WebSocket): string[] =>
  Array.from(nodeWatchers.keys()).filter((connectionId) => unsubscribe(connectionId, ws))

export const getOtherWatchers = (connectionId: string, excludeWs: WebSocket): WebSocket[] =>
  [...(nodeWatchers.get(connectionId) ?? [])].filter((ws) => ws !== excludeWs)

export const getWatcherCount = (connectionId: string): number =>
  nodeWatchers.get(connectionId)?.size ?? 0

// Exposed for testing only
export const _reset = (): void => {
  nodeWatchers.clear()
}
