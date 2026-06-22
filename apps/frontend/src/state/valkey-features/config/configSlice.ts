import { type KeyEvictionPolicy } from "@common/src/constants"
import { createSlice } from "@reduxjs/toolkit"
import * as R from "ramda"
import { VALKEY } from "@common/src/constants"
import type { RootState } from "@/store"

type UpdateStatus = "updating" | "updated" | "failed"
export const selectConfig = (id: string) => (state: RootState) =>
  R.path([VALKEY.CONFIG.name, id], state)

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
  [connectionId: string]: {
    darkMode: boolean,
    // Valkey related. TODO: find best way to expose to user
    keyEvictionPolicy?: KeyEvictionPolicy
    clusterSlotStatsEnabled?: boolean,
    monitoring: MonitorConfig
    status: UpdateStatus
    errorMessage?: string | null
  }
}
const initialState: ConfigState = {}
const defaultConfig = (partial?: Partial<ConfigState[string]>): ConfigState[string] => ({
  darkMode: false,
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
      const { connectionId, connectionDetails: { clusterId, keyEvictionPolicy, clusterSlotStatsEnabled } } = action.payload
      // `setConfig` seeds local config from connection identity (not a server
      // reply), so its clusterId lives under connectionDetails. Key by clusterId
      // for clusters or connectionId for standalone.
      const key = clusterId ?? connectionId
      if (!state[key]) {
        state[key] = defaultConfig({
          keyEvictionPolicy,
          clusterSlotStatsEnabled: clusterSlotStatsEnabled ?? false,
        })
      }
    },

    updateConfig: (state, action) => {
      const key = action.payload.clusterId ?? action.payload.connectionId
      if (!state[key]) {
        state[key] = defaultConfig({ status: "updating" })
        return
      }
      state[key].status = "updating"
      state[key].errorMessage = null // reset any previous error
    },

    updateConfigFulfilled: (state, action) => {
      const { connectionId, clusterId, response } = action.payload
      const key = clusterId ?? connectionId
      if (!state[key]) {
        state[key] = defaultConfig()
      }

      if (response.data?.epic) {
        const updatedMonitoringConfig = R.pick(
          Object.keys(defaultConfig().monitoring),
          response.data.epic,
        )
        state[key].monitoring = {
          ...state[key].monitoring,
          ...updatedMonitoringConfig,
        }
      }

      state[key].status = "updated"
      state[key].errorMessage = null
    },

    updateConfigFailed: (state, action) => {
      const { response } = action.payload
      const key = action.payload.clusterId ?? action.payload.connectionId
      if (!state[key]) {
        state[key] = defaultConfig({ status: "failed", errorMessage: response.errorMessage })
        return
      }
      state[key].status = "failed"
      state[key].errorMessage = response.errorMessage
    },
  },
})

export default configSlice.reducer
export const { setConfig, updateConfig, updateConfigFulfilled, updateConfigFailed } = configSlice.actions
