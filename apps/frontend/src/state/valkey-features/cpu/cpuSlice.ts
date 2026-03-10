import { createSlice } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectCpuUsage =
  (connectionId: string) =>
    (state: RootState) =>
      R.path([VALKEY.CPU.name, connectionId, "data"], state)

interface CpuDataPoint {
  timestamp: number
  value: number
}

interface CpuState {
  [connectionId: string]: {
    data: CpuDataPoint[]
    error?: JSONObject | null
    loading?: boolean
  }
}

const initialCpuState: CpuState = {}

const cpuSlice = createSlice({
  name: "cpu",
  initialState: initialCpuState,
  reducers: {
    cpuUsageRequested: (state, action) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          data: [],
          loading: false,
        }
      }
      state[connectionId].loading = true
    },
    cpuUsageFulfilled: (state, action) => {
      const { connectionId, parsedResponse } = action.payload

      // Validate that parsedResponse is an array
      if (Array.isArray(parsedResponse)) {
        state[connectionId].data = parsedResponse
      } else {
        console.error("Invalid CPU usage response format:", parsedResponse)
        state[connectionId].data = []
        state[connectionId].error = { message: "Invalid data format received" }
      }
      state[connectionId].loading = false
    },
    cpuUsageError: (state, action) => {
      const { connectionId, error } = action.payload
      if (state[connectionId]) {
        state[connectionId].error = error
        state[connectionId].loading = false
      }
    },
  },
})

export default cpuSlice.reducer
export const {
  cpuUsageRequested,
  cpuUsageFulfilled,
  cpuUsageError,
} = cpuSlice.actions
