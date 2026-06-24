import { createSlice } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants.ts"
import { toNodeId } from "@common/src/connection-id.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectMonitorRunning =
  (nodeId: string) =>
    (state: RootState) =>
      R.path<boolean>([VALKEY.MONITOR.name, nodeId, "monitorRunning"], state) ?? false

export const selectMonitorLoading =
  (nodeId: string) =>
    (state: RootState) =>
      R.path<boolean>([VALKEY.MONITOR.name, nodeId, "loading"], state) ?? false

export const selectMonitorError =
  (connectionId: string) =>
    (state: RootState) =>
      R.path<string | null>([VALKEY.MONITOR.name, connectionId, "error"], state) ?? null

export const selectRunningMonitorConnections =
  (state: RootState): { nodeId: string; clusterId?: string; startedAt: number | null }[] => {
    const monitorState = R.path<MonitorState>([VALKEY.MONITOR.name], state) ?? {}
    // The entry key is a `nodeId` for both cluster and standalone
    // entries. `clusterId` (when present) groups cluster nodes.
    return Object.entries(monitorState)
      .filter(([, entry]) => entry.monitorRunning)
      .map(([nodeId, entry]) => ({ nodeId, clusterId: entry.clusterId, startedAt: entry.startedAt }))
  }

/**
 * Cluster monitor state is stored PER NODE (keyed by `nodeId` and
 * tagged with `clusterId`). The cluster route `id` is a db-suffixed
 * Connection_Identifier, so it never matches those entries directly. Roll the
 * per-node entries up by `clusterId` and report running iff at least one node is
 * present and all present nodes are running.
 */
export const selectClusterMonitorRunning =
  (clusterId: string) =>
    (state: RootState): boolean => {
      const monitorState = R.path<MonitorState>([VALKEY.MONITOR.name], state) ?? {}
      const entries = Object.values(monitorState).filter((entry) => entry.clusterId === clusterId)
      return entries.length > 0 && entries.every((entry) => entry.monitorRunning)
    }

/** Cluster-aware loading: loading iff any node entry for the cluster is loading. */
export const selectClusterMonitorLoading =
  (clusterId: string) =>
    (state: RootState): boolean => {
      const monitorState = R.path<MonitorState>([VALKEY.MONITOR.name], state) ?? {}
      return Object.values(monitorState).some((entry) => entry.clusterId === clusterId && entry.loading)
    }

interface MonitorState {
  [nodeId: string]: {
    monitorRunning: boolean
    checkAt: number | null
    loading: boolean
    error?: string | null
    startedAt: number | null
    // Present on per-node cluster entries to groups entries into a cluster.
    clusterId?: string
  }
}

const initialMonitorState: MonitorState = {}

const monitorSlice = createSlice({
  name: "monitor",
  initialState: initialMonitorState,
  reducers: {
    monitorRequested: (state, action) => {
      const { connectionId, clusterId } = action.payload
      // Cluster monitor state is populated per-node by the replies; do not
      // create a pending entry under the representative db-suffixed `id!`
      if (clusterId) return
      // Standalone monitor state is node-level; key the pending entry by the
      // db-less nodeId so it matches the nodeId-keyed reply entries.
      const nodeId = toNodeId(connectionId)
      if (!state[nodeId]) {
        state[nodeId] = {
          monitorRunning: false,
          checkAt: null,
          loading: false,
          startedAt: null,
        }
      }
      state[nodeId].loading = true
    },
    monitorFulfilled: (state, action) => {
      // Cluster replies carry `{ clusterId, nodeId }` (key by nodeId, tag
      // clusterId); standalone carries `{ nodeId }`.
      const { nodeId, clusterId, parsedResponse } = action.payload
      if (!state[nodeId]) {
        state[nodeId] = {
          monitorRunning: false,
          checkAt: null,
          loading: false,
          startedAt: null,
        }
      }
      if (clusterId) state[nodeId].clusterId = clusterId
      state[nodeId].monitorRunning = parsedResponse.monitorRunning ?? false
      state[nodeId].checkAt = parsedResponse.checkAt ?? null
      state[nodeId].startedAt = parsedResponse.startedAt ?? null
      state[nodeId].loading = false
      if (parsedResponse.monitorRunning) state[nodeId].error = null
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    saveMonitorSettingsRequested: (_state, _action) => {
      // no-op: exists to generate the action creator for the epic
    },
    monitorError: (state, action) => {
      const { nodeId, clusterId, error } = action.payload
      if (!state[nodeId]) {
        state[nodeId] = {
          monitorRunning: false,
          checkAt: null,
          loading: false,
          startedAt: null,
        }
      }
      if (clusterId) state[nodeId].clusterId = clusterId
      state[nodeId].error = error
      state[nodeId].loading = false
    },
  },
})

export default monitorSlice.reducer
export const {
  monitorRequested,
  monitorFulfilled,
  monitorError,
  saveMonitorSettingsRequested,
} = monitorSlice.actions
