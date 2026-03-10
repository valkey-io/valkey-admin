import { type KeyEvictionPolicy } from "@common/src/constants"
import { createSlice } from "@reduxjs/toolkit"
import * as R from "ramda"
import { VALKEY } from "@common/src/constants"
import { type RootState } from "@/store"

type UpdateStatus = "updating" | "updated" | "failed"
export const selectConfig = (id: string) => (state: RootState) =>
  R.path([VALKEY.CONFIG.name, id], state)

interface MonitorConfig {
  monitorEnabled: boolean, 
  // How long to monitor before stopping (ms)
  monitorDuration: number,

  // TODO: expose monitorInterval and continuousMonitoring
  // How long to wait before monitoring again when using continuous mode (ms)
  monitorInterval?: number,
  // Default is one cycle and then turn off monitoring
  continuousMonitoring?: boolean,
}
interface ConfigState {
  [connectionId: string]: {
    darkMode: boolean,
    // Valkey related. TODO: find best way to expose to user
    keyEvictionPolicy?: KeyEvictionPolicy
    clusterSlotStatsEnabled?: boolean,
    pollingInterval: number, 
    monitoring: MonitorConfig
    status: UpdateStatus
    errorMessage?: string | null
  }
}
const initialState: ConfigState = {}
const defaultConfig = (partial?: Partial<ConfigState[string]>): ConfigState[string] => ({
  darkMode: false,
  pollingInterval: 5000,
  monitoring: { monitorEnabled: false, monitorDuration: 6000 },
  status: "updated",
  errorMessage: null,
  ...partial, // merge any passed-in values
})

const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    setConfig: (state, action) => {
      const { connectionId, keyEvictionPolicy, clusterSlotStatsEnabled } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = defaultConfig({
          keyEvictionPolicy,
          clusterSlotStatsEnabled: clusterSlotStatsEnabled ?? false,
        })
      }
    },

    updateConfig: (state, action) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = defaultConfig({ status: "updating" })
        return
      }
      state[connectionId].status = "updating"
      state[connectionId].errorMessage = null // reset any previous error
    },

    updateConfigFulfilled: (state, action) => {
      const { connectionId, response } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = defaultConfig({ ...response.data, status: "updated" })
        return
      }
      state[connectionId] = {
        ...state[connectionId],
        ...response.data,
        status: "updated",
        errorMessage: null,
      }
    },

    updateConfigFailed: (state, action) => {
      const { connectionId, response } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = defaultConfig({ status: "failed", errorMessage: response.errorMessage })
        return
      }
      state[connectionId].status = "failed"
      state[connectionId].errorMessage = response.errorMessage
    },
  },
})

export default configSlice.reducer
export const { setConfig, updateConfig, updateConfigFulfilled, updateConfigFailed } = configSlice.actions
