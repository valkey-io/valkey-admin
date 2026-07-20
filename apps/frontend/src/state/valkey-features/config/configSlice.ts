import { createSlice } from "@reduxjs/toolkit"
import * as R from "ramda"
import { VALKEY, MISSING_MESSAGE, NOT_ATTEMPTED_MESSAGE } from "@common/src/constants"
import { toNodeId } from "@common/src/connection-id.ts"
import {
  type NodeResult,
  type NodeRetryStatus,
  type NodeStatusUpdate,
  type ReplyOutcome
} from "@common/src/node-results.ts"
import type { RootState } from "@/store"

type UpdateStatus =
  | "updating"
  | "updated"
  | "failed"
  | "partial"
  | "not_attempted"

// `targetId` is the state key: `clusterId` for a cluster or the db-less
// `nodeId` for a standalone node.
export const selectConfig = (targetId: string) => (state: RootState): ConfigEntry | undefined =>
  R.path<ConfigEntry>([VALKEY.CONFIG.name, targetId], state)

/**
 * Live per-node statuses for a `Target_Id`.
 */
export const selectConfigNodeStatuses =
  (targetId: string) =>
    (state: RootState): ConfigEntry["nodeStatuses"] =>
      R.path<ConfigEntry["nodeStatuses"]>(
        [VALKEY.CONFIG.name, targetId, "nodeStatuses"],
        state,
      ) ?? {}

/** Targeted nodes with no registered metrics process, shown distinctly from failures. */
export const selectConfigNotAttemptedNodeIds =
  (targetId: string) =>
    (state: RootState): string[] =>
      R.path<ConfigEntry["notAttemptedNodeIds"]>(
        [VALKEY.CONFIG.name, targetId, "notAttemptedNodeIds"],
        state,
      ) ?? []

interface MonitorConfig {
  // How long to monitor before stopping (ms)
  monitoringDuration: number,
  // How long to wait before monitoring again when using continuous mode (ms)
  monitoringInterval: number,
  // Maximum number of commands captured per monitoring cycle
  maxCommandsPerRun: number,
  // Minimum access count for a key to be considered hot
  cutoffFrequency: number,
}

// One node's live status entry, keyed by `nodeId` in `ConfigEntry.nodeStatuses`.
export type NodeStatusEntry = Omit<NodeStatusUpdate, "nodeId">

export interface ConfigEntry {
  monitoring: MonitorConfig
  status: UpdateStatus
  errorMessage?: string | null
  // Live per-node statuses keyed by db-less `nodeId`, driven by the server's
  // automatic retry session.
  nodeStatuses: Record<string, NodeStatusEntry>
  // Number of nodes that updated successfully, for partial-failure display.
  succeededCount: number
  // Targeted nodes with no registered Metrics_Process, reported distinctly
  // from failed nodes.
  notAttemptedNodeIds: string[]
  // Which id-arm this entry was keyed by, so the banner can classify the
  // target as a cluster or standalone row without relying on live connections.
  kind?: "cluster" | "standalone"
}

interface ConfigState {
  // Node-level metrics config keyed by `targetId`: `clusterId` (cluster) or the
  // db-less `nodeId` (standalone).
  [targetId: string]: ConfigEntry
}
const initialState: ConfigState = {}
const defaultConfig = (partial?: Partial<ConfigEntry>): ConfigEntry => ({
  monitoring: { monitoringDuration: 10000, monitoringInterval: 10000, maxCommandsPerRun: 1000000, cutoffFrequency: 100 },
  status: "updated",
  errorMessage: null,
  nodeStatuses: {},
  succeededCount: 0,
  notAttemptedNodeIds: [],
  ...partial, // merge any passed-in values
})

/**
 * Read the `Target_Id` from a reply payload: `clusterId` for a cluster or the
 * db-less `nodeId` for a standalone node. Returns `undefined` when neither
 * is present.
 */
const replyTargetId = (payload: {
  clusterId?: unknown
  nodeId?: unknown
}): string | undefined => {
  if (typeof payload.clusterId === "string") return payload.clusterId
  if (typeof payload.nodeId === "string") return payload.nodeId
  return undefined
}

/**
 * Reconcile the live `nodeStatuses` to terminal values from a final aggregate
 * reply. The map is rebuilt from `nodeResults + notAttemptedNodeIds`
 * (attempt counters carried over from the in-flight entries where present).
 * A node absent from the final reply (e.g. removed from the cluster between
 * sessions) will not linger with a stale status.
 */
const reconcileNodeStatuses = (
  entry: ConfigEntry,
  nodeResults: NodeResult[],
  notAttemptedNodeIds: string[],
): void => {
  const reconciled: ConfigEntry["nodeStatuses"] = {}
  for (const result of nodeResults) {
    const existing = entry.nodeStatuses[result.nodeId]
    reconciled[result.nodeId] = {
      status: result.success ? "succeeded" : "failed",
      attempt: existing?.attempt ?? 1,
      maxAttempts: existing?.maxAttempts ?? 1,
      message: result.success ? undefined : (result.message ? result.message : MISSING_MESSAGE),
    }
  }
  for (const nodeId of notAttemptedNodeIds) {
    reconciled[nodeId] = {
      status: "not_attempted",
      attempt: 0,
      maxAttempts: entry.nodeStatuses[nodeId]?.maxAttempts ?? 1,
      message: NOT_ATTEMPTED_MESSAGE,
    }
  }
  entry.nodeStatuses = reconciled
}

const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    setConfig: (state, action) => {
      const { connectionId, connectionDetails: { clusterId } } = action.payload
      // `setConfig` seeds local config from connection identity (not a server
      // reply). Config is node-level, so key by clusterId for clusters or
      // nodeId for standalone.
      const targetId = clusterId ?? toNodeId(connectionId)
      if (!state[targetId]) {
        state[targetId] = defaultConfig({ kind: clusterId ? "cluster" : "standalone" })
      }
    },

    // The config push request: reset this target's session state
    // optimistically so the banner shows a fresh "in progress" instead of the
    // previous session's stale statuses/header while the new session's pushes
    // stream in. Carries an optional `monitorAction` rider that the server
    // applies to the config-succeeded nodes after the session.
    updateConfig: (state, action) => {
      // Defensive: a toggle-only request belongs on `monitor/monitorRequested`
      // and starts no config session; nothing to reset.
      if (!action.payload?.config) return
      const { clusterId, connectionId } = action.payload
      const targetId = clusterId ?? (connectionId ? toNodeId(connectionId) : undefined)
      if (targetId === undefined) return
      const kind: "cluster" | "standalone" = clusterId ? "cluster" : "standalone"
      if (!state[targetId]) {
        state[targetId] = defaultConfig({ status: "updating", kind })
        return
      }
      state[targetId].status = "updating"
      state[targetId].errorMessage = null // reset any previous error
      state[targetId].nodeStatuses = {}
      state[targetId].notAttemptedNodeIds = []
      state[targetId].kind = kind
    },

    // Live per-node status push from the server's automatic retry session.
    updateConfigNodeStatus: (state, action) => {
      const targetId = replyTargetId(action.payload)
      const { nodeId, status, attempt, maxAttempts, message, nextRetryMs } = action.payload
      if (targetId === undefined || typeof nodeId !== "string" || typeof status !== "string") {
        console.warn("[config] Ignoring malformed updateConfigNodeStatus push", action.payload)
        return
      }
      if (!state[targetId]) {
        state[targetId] = defaultConfig({ status: "updating" })
      }
      state[targetId].nodeStatuses[nodeId] = {
        status: status as NodeRetryStatus,
        attempt: typeof attempt === "number" ? attempt : 0,
        maxAttempts: typeof maxAttempts === "number" ? maxAttempts : 1,
        message: typeof message === "string" ? message : undefined,
        nextRetryMs: typeof nextRetryMs === "number" ? nextRetryMs : undefined,
      }
    },

    // Every attempted node succeeded.
    updateConfigFulfilled: (state, action) => {
      const targetId = replyTargetId(action.payload)
      const { nodeResults, appliedConfig } = action.payload
      // Guard a missing target id or unreadable results.
      if (targetId === undefined || (nodeResults !== undefined && !Array.isArray(nodeResults))) {
        console.warn("[config] Ignoring malformed updateConfigFulfilled reply", action.payload)
        return
      }
      if (!state[targetId]) {
        state[targetId] = defaultConfig({ status: "updating" })
      }

      const epic = appliedConfig?.epic
      if (epic) {
        const updatedMonitoringConfig = R.pick(
          Object.keys(defaultConfig().monitoring),
          epic,
        )
        state[targetId].monitoring = {
          ...state[targetId].monitoring,
          ...updatedMonitoringConfig,
        }
      }

      state[targetId].status = "updated"
      state[targetId].errorMessage = null
      state[targetId].succeededCount = Array.isArray(nodeResults) ? nodeResults.length : 0
      // A fulfilled reply can still carry not-attempted nodes, keep them
      // visible rather than dropping them.
      state[targetId].notAttemptedNodeIds = Array.isArray(action.payload.notAttemptedNodeIds)
        ? action.payload.notAttemptedNodeIds as string[]
        : []
      state[targetId].kind = typeof action.payload.clusterId === "string" ? "cluster" : "standalone"
      reconcileNodeStatuses(
        state[targetId],
        Array.isArray(nodeResults) ? nodeResults : [],
        state[targetId].notAttemptedNodeIds,
      )
    },

    // At least one attempted node failed (after the server exhausted its
    // automatic retries), or the update could not be attempted.
    updateConfigFailed: (state, action) => {
      const targetId = replyTargetId(action.payload)
      const outcome = action.payload.outcome as ReplyOutcome | undefined
      const nodeResults = action.payload.nodeResults as NodeResult[] | undefined

      // Guard a missing target id or unreadable results.
      if (targetId === undefined || (nodeResults !== undefined && !Array.isArray(nodeResults))) {
        console.warn("[config] Ignoring malformed updateConfigFailed reply", action.payload)
        return
      }

      if (!state[targetId]) {
        state[targetId] = defaultConfig({ status: "updating" })
      }
      const entry = state[targetId]

      entry.notAttemptedNodeIds = Array.isArray(action.payload.notAttemptedNodeIds)
        ? action.payload.notAttemptedNodeIds as string[]
        : []
      entry.kind = typeof action.payload.clusterId === "string" ? "cluster" : "standalone"

      // No node had a registered metrics process.
      if (outcome === "not_attempted") {
        entry.status = "not_attempted"
        entry.errorMessage = NOT_ATTEMPTED_MESSAGE
        entry.succeededCount = 0
        reconcileNodeStatuses(entry, [], entry.notAttemptedNodeIds)
        return
      }

      const results = nodeResults ?? []
      const succeeded = results.filter((result) => result.success)
      entry.succeededCount = succeeded.length
      // Partial when at least one node also succeeded, failure otherwise.
      entry.status = succeeded.length > 0 ? "partial" : "failed"
      const firstFailed = results.find((result) => !result.success)
      entry.errorMessage = firstFailed
        ? (firstFailed.message ? firstFailed.message : MISSING_MESSAGE)
        : null
      reconcileNodeStatuses(entry, results, entry.notAttemptedNodeIds)
    },
  },
})

export default configSlice.reducer
export const {
  setConfig,
  updateConfig,
  updateConfigNodeStatus,
  updateConfigFulfilled,
  updateConfigFailed,
} = configSlice.actions
