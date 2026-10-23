import { VALKEY, toNodeId } from "valkey-common"
import { CONNECTION_TEARDOWN_DELAY_MS } from "valkey-common"
import { findOwnerState, ownerOf, type OwnerState } from "./owner"
import { getWatcherCount, scopedId } from "./node-watchers"
import { teardownConnection } from "./connection"
import type { ConnectionDetails } from "./actions/connection"

/**
 * What one browser WebSocket may act on.
 *
 * A socket may act only on Valkey connections it opened itself with
 * credentials that Valkey accepted. Each bound connection records the owner
 * identity it authenticated as, and every action resolves to that owner's
 * state. This replaces the old cookie sessions.
 */
export type SocketBinding = {
  /** connectionId → owner key */
  connections: Map<string, string>
  /** db-less node id → owner key, for actions that name a node */
  nodes: Map<string, string>
  /** owner key → (clusterId → connectionIds), per-socket cluster bookkeeping */
  clustersByOwner: Map<string, Map<string, string[]>>
}

export const createSocketBinding = (): SocketBinding => ({
  connections: new Map(),
  nodes: new Map(),
  clustersByOwner: new Map(),
})

/** Bind a connection to the socket. Returns the owner it was bound to before, if that was another owner. */
export const bindConnection = (binding: SocketBinding, ownerKey: string, connectionId: string): string | undefined => {
  const previous = binding.connections.get(connectionId)
  binding.connections.set(connectionId, ownerKey)
  binding.nodes.set(toNodeId(connectionId), ownerKey)
  return previous !== undefined && previous !== ownerKey ? previous : undefined
}

export const unbindConnection = (binding: SocketBinding, connectionId: string): void => {
  binding.connections.delete(connectionId)
  const nodeId = toNodeId(connectionId)
  const nodeStillBound = [...binding.connections.keys()].some((id) => toNodeId(id) === nodeId)
  if (!nodeStillBound) binding.nodes.delete(nodeId)
}

export const connectedNodesFor = (binding: SocketBinding, ownerKey: string): Map<string, string[]> => {
  let clusters = binding.clustersByOwner.get(ownerKey)
  if (!clusters) {
    clusters = new Map()
    binding.clustersByOwner.set(ownerKey, clusters)
  }
  return clusters
}

type ActionLike = { type: string; payload?: { connectionId?: string; clusterId?: unknown; connectionDetails?: unknown } }

export type ResolvedAction =
  /**
   * `state` is undefined only for a connect or a discovery whose owner has no
   * entry yet. A connect creates the entry after Valkey accepts the credentials.
   */
  | { ok: true; ownerKey: string; state: OwnerState | undefined }
  | { ok: false; reason: string }

// The cluster that a bound connection (or a db-less node id) belongs to in its owner's state.
const clusterOf = (state: OwnerState, connectionId: string): string | undefined => {
  const direct = state.clients.get(connectionId)?.clusterId
  if (direct) return direct
  for (const [id, entry] of state.clients) {
    if (toNodeId(id) === connectionId && entry.clusterId) return entry.clusterId
  }
  return undefined
}

/**
 * Decide which owner's state an action runs against, or reject it.
 *
 * - A connect is resolved to the owner named by its connection details. It is
 *   bound to the socket only after Valkey accepts the credentials.
 * - Any other action must name a connectionId (or db-less node id) bound on
 *   this socket. A clusterId is accepted only if it is the cluster of that
 *   connection in the owner's state. An empty clusterId counts as absent.
 */
export const resolveAction = (
  binding: SocketBinding,
  action: ActionLike,
  lookup: (ownerKey: string) => OwnerState | undefined = findOwnerState,
): ResolvedAction => {
  const payload = action.payload ?? {}

  if (action.type === VALKEY.CONNECTION.connectPending || action.type === VALKEY.TOPOLOGY.discoveryEndpointPending) {
    const details = payload.connectionDetails as ConnectionDetails | undefined
    if (!details || typeof details !== "object") return { ok: false, reason: "missing connection details" }
    const ownerKey = ownerOf(details)
    // Look up only: Valkey has not accepted these credentials yet.
    return { ok: true, ownerKey, state: findOwnerState(ownerKey) }
  }

  const { connectionId } = payload
  if (typeof connectionId !== "string" || connectionId.length === 0) {
    return { ok: false, reason: "missing connectionId" }
  }
  const ownerKey = binding.connections.get(connectionId) ?? binding.nodes.get(connectionId)
  if (ownerKey === undefined) return { ok: false, reason: `connection ${connectionId} is not bound to this socket` }
  const state = lookup(ownerKey)
  if (!state) return { ok: false, reason: `no state for the owner of ${connectionId}` }

  const { clusterId } = payload
  if (clusterId && clusterOf(state, connectionId) !== clusterId) {
    return { ok: false, reason: `connection ${connectionId} is not part of cluster ${String(clusterId)}` }
  }
  return { ok: true, ownerKey, state }
}

/**
 * Tear down an owner's connection after the teardown delay, unless a socket
 * watches it again in that time.
 */
export const scheduleRelease = (state: OwnerState, connectionId: string): void => {
  setTimeout(() => {
    if (getWatcherCount(scopedId(state.ownerKey, connectionId)) === 0) {
      teardownConnection(state, connectionId)
    }
  }, CONNECTION_TEARDOWN_DELAY_MS)
}
