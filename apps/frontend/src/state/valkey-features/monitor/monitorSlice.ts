import { createSlice } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectMonitorRunning =
  (connectionId: string) =>
    (state: RootState) =>
      R.path<boolean>([VALKEY.MONITOR.name, connectionId, "monitorRunning"], state) ?? false

export const selectMonitorLoading =
  (connectionId: string) =>
    (state: RootState) =>
      R.path<boolean>([VALKEY.MONITOR.name, connectionId, "loading"], state) ?? false

interface MonitorState {
  [connectionId: string]: {
    monitorRunning: boolean
    checkAt: number | null
    loading: boolean
    error?: string | null
  }
}

const initialMonitorState: MonitorState = {}

const monitorSlice = createSlice({
  name: "monitor",
  initialState: initialMonitorState,
  reducers: {
    monitorRequested: (state, action) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          monitorRunning: false,
          checkAt: null,
          loading: false,
        }
      }
      state[connectionId].loading = true
    },
    monitorFulfilled: (state, action) => {
      const { connectionId, parsedResponse } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          monitorRunning: false,
          checkAt: null,
          loading: false,
        }
      }
      state[connectionId].monitorRunning = parsedResponse.monitorRunning ?? false
      state[connectionId].checkAt = parsedResponse.checkAt ?? null
      state[connectionId].loading = false
      state[connectionId].error = null
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    saveMonitorSettingsRequested: (state, action) => {
      // no-op: exists to generate the action creator for the epic
    },
    monitorError: (state, action) => {
      const { connectionId, error } = action.payload
      if (state[connectionId]) {
        state[connectionId].error = error
        state[connectionId].loading = false
      }
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
