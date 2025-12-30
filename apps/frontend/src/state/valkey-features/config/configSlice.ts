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
  // How long to wait before monitoring again when using continuous mode (ms)
  //monitorInterval: number,
  // Default is one cycle and then turn off monitoring
  //continuousMonitoring: boolean,
}
interface ConfigState {
  [connectionId: string]: {
    darkMode: boolean,
    keyEvictionPolicy?: KeyEvictionPolicy
    clusterSlotStatsEnabled?: boolean,
    pollingInterval: number, 
    monitoring: MonitorConfig
    status: UpdateStatus
    errorMessage?: string | null
  }
}
const initialState: ConfigState = {}
const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    setConfig: (state, action) => {
      const { connectionId, keyEvictionPolicy, clusterSlotStatsEnabled } = action.payload
      state[connectionId] = {
        darkMode: false, 
        keyEvictionPolicy, 
        clusterSlotStatsEnabled: clusterSlotStatsEnabled ?? false, 
        pollingInterval: 5000,
        monitoring: {
          monitorEnabled: false, 
          monitorDuration: 6000,
          //monitorInterval: 20000, 
          //continuousMonitoring: false,
        },
        status: "updated",
      }
    },
    updateConfig: (state, action) => {
      const { connectionId } = action.payload
      state[connectionId].status = "updating"
    },
    updateConfigFulfilled: (state, action) => {
      const { connectionId } = action.payload
      state[connectionId] = { ...state[connectionId], ...action.payload.data }
      state[connectionId].status = "updated"
    },
    updateConfigFailed: (state, action) => {
      const { connectionId, response } = action.payload
      state[connectionId].status = "failed"
      state[connectionId].errorMessage = response.errorMessage
    },
  },
})

export default configSlice.reducer
export const { setConfig, updateConfig } = configSlice.actions
