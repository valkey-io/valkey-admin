import { createSlice } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { VALKEY } from "@common/src/constants.ts"
import { toNodeId } from "@common/src/connection-id.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectCpuUsage =
  (id: string) =>
    (state: RootState) =>
      R.path([VALKEY.CPU.name, toNodeId(id), "data"], state)

export const selectCpuUsageLoading =
  (id: string) =>
    (state: RootState) =>
      R.pathOr(false, [VALKEY.CPU.name, toNodeId(id), "loading"], state)

interface CpuDataPoint {
  timestamp: number
  value: number
}

interface CpuState {
  [nodeId: string]: {
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
      const { connectionId, nodeId: explicitNodeId } = action.payload
      const nodeId = explicitNodeId ?? toNodeId(connectionId)
      if (!state[nodeId]) {
        state[nodeId] = {
          data: [],
          loading: false,
        }
      }
      state[nodeId].loading = true
    },
    cpuUsageFulfilled: (state, action) => {
      const { nodeId: explicitNodeId, connectionId, parsedResponse } = action.payload
      const nodeId = explicitNodeId ?? toNodeId(connectionId)
      if (!state[nodeId]) {
        state[nodeId] = {
          data: [],
          loading: false,
        }
      }
      // Validate that parsedResponse is an array
      if (Array.isArray(parsedResponse)) {
        state[nodeId].data = parsedResponse
      } else {
        console.error("Invalid CPU usage response format:", parsedResponse)
        state[nodeId].data = []
        state[nodeId].error = { message: "Invalid data format received" }
      }
      state[nodeId].loading = false
    },
    cpuUsageError: (state, action) => {
      const { nodeId: explicitNodeId, connectionId, error } = action.payload
      const nodeId = explicitNodeId ?? toNodeId(connectionId)
      if (state[nodeId]) {
        state[nodeId].error = error
        state[nodeId].loading = false
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
