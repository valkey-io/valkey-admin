import { createSlice } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectCpuUsage =
  (connectionId: string) =>
    (state: RootState) =>
      R.path([VALKEY.CPU.name, connectionId, "data"], state)

export const selectCpuUsageLoading =
  (connectionId: string) =>
    (state: RootState) =>
      R.pathOr(false, [VALKEY.CPU.name, connectionId, "loading"], state)

interface CpuDataPoint {
  timestamp: number
  value: number
}

interface CpuState {
  [connectionId: string]: {
    data: CpuDataPoint[]
    error?: JSONObject | null
    loading?: boolean
    requestId?: string
  }
}

const initialCpuState: CpuState = {}

const cpuSlice = createSlice({
  name: "cpu",
  initialState: initialCpuState,
  reducers: {
    cpuUsageRequested: (state, action) => {
      const { connectionId, requestId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          data: [],
          loading: false,
        }
      }
      state[connectionId].loading = true
      state[connectionId].requestId = requestId
    },
    cpuUsageFulfilled: (state, action) => {
      const { connectionId, parsedResponse, requestId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          data: [],
          loading: false,
        }
      }
      // Drop out-of-order response if a newer request was dispatched
      if (requestId && state[connectionId].requestId && requestId !== state[connectionId].requestId) {
        return
      }
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
      const { connectionId, error, requestId } = action.payload
      if (state[connectionId]) {
        if (requestId && state[connectionId].requestId && requestId !== state[connectionId].requestId) {
          return
        }
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
