import { createSlice } from "@reduxjs/toolkit"
import * as R from "ramda"
import { VALKEY } from "@common/src/constants"
import { toNodeId } from "@common/src/connection-id.ts"
import type { RootState } from "@/store"

type UpdateStatus = "updating" | "updated" | "failed"
// `targetId` is the state key: `clusterId` for a cluster or the db-less
// `nodeId` for a standalone node.
export const selectConfig = (targetId: string) => (state: RootState) =>
  R.path([VALKEY.CONFIG.name, targetId], state)

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
interface ConfigState {
  // Node-level metrics config keyed by `targetId`: `clusterId` (cluster) or the
  // db-less `nodeId` (standalone).
  [targetId: string]: {
    monitoring: MonitorConfig
    status: UpdateStatus
    errorMessage?: string | null
  }
}
const initialState: ConfigState = {}
const defaultConfig = (partial?: Partial<ConfigState[string]>): ConfigState[string] => ({
  monitoring: { monitoringDuration: 10000, monitoringInterval: 10000, maxCommandsPerRun: 1000000, cutoffFrequency: 100 },
  status: "updated",
  errorMessage: null,
  ...partial, // merge any passed-in values
})

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
        state[targetId] = defaultConfig()
      }
    },

    updateConfig: (state, action) => {
      const targetId = action.payload.clusterId ?? action.payload.nodeId
      if (!state[targetId]) {
        state[targetId] = defaultConfig({ status: "updating" })
        return
      }
      state[targetId].status = "updating"
      state[targetId].errorMessage = null // reset any previous error
    },

    updateConfigFulfilled: (state, action) => {
      const { nodeId, clusterId, response } = action.payload
      const targetId = clusterId ?? nodeId
      if (!state[targetId]) {
        state[targetId] = defaultConfig()
      }

      if (response.data?.epic) {
        const updatedMonitoringConfig = R.pick(
          Object.keys(defaultConfig().monitoring),
          response.data.epic,
        )
        state[targetId].monitoring = {
          ...state[targetId].monitoring,
          ...updatedMonitoringConfig,
        }
      }

      state[targetId].status = "updated"
      state[targetId].errorMessage = null
    },

    updateConfigFailed: (state, action) => {
      const { response } = action.payload
      const targetId = action.payload.clusterId ?? action.payload.nodeId
      if (!state[targetId]) {
        state[targetId] = defaultConfig({ status: "failed", errorMessage: response.errorMessage })
        return
      }
      state[targetId].status = "failed"
      state[targetId].errorMessage = response.errorMessage
    },
  },
})

export default configSlice.reducer
export const { setConfig, updateConfig, updateConfigFulfilled, updateConfigFailed } = configSlice.actions
