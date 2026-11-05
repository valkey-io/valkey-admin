import { createSlice } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { VALKEY } from "@common/src/constants.ts"
import { toNodeId } from "@common/src/connection-id.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectMemoryUsage =
  (id: string) =>
    (state: RootState) =>
      R.path([VALKEY.MEMORY.name, toNodeId(id), "data"], state)

export const selectMemoryUsageLoading =
  (id: string) =>
    (state: RootState) =>
      R.pathOr(false, [VALKEY.MEMORY.name, toNodeId(id), "loading"], state)

interface MemoryMetric {
  description: string
  series: Array<{
    timestamp: number
    value: number
  }>
}

interface MemoryData {
  [key: string]: MemoryMetric
}

interface MemoryState {
  [nodeId: string]: {
    data: MemoryData | null
    error?: JSONObject | null
    loading?: boolean
  }
}

const initialMemoryState: MemoryState = {}

const memorySlice = createSlice({
  name: "memory",
  initialState: initialMemoryState,
  reducers: {
    memoryUsageRequested: (state, action) => {
      const { connectionId, nodeId: explicitNodeId } = action.payload
      const nodeId = explicitNodeId ?? toNodeId(connectionId)
      if (!state[nodeId]) {
        state[nodeId] = {
          data: null,
          loading: false,
        }
      }
      state[nodeId].loading = true
    },
    memoryUsageFulfilled: (state, action) => {
      const { nodeId: explicitNodeId, connectionId, parsedResponse } = action.payload
      const nodeId = explicitNodeId ?? toNodeId(connectionId)
      if (!state[nodeId]) {
        state[nodeId] = {
          data: null,
          loading: false,
        }
      }
      // validating that parsedResponse is an object (not an array, not null)
      if (parsedResponse && typeof parsedResponse === "object" && !Array.isArray(parsedResponse)) {
        state[nodeId].data = parsedResponse
      } else {
        console.error("Invalid memory usage response format:", parsedResponse)
        state[nodeId].data = null
        state[nodeId].error = { message: "Invalid data format received" }
      }
      state[nodeId].loading = false
    },
    memoryUsageError: (state, action) => {
      const { nodeId: explicitNodeId, connectionId, error } = action.payload
      const nodeId = explicitNodeId ?? toNodeId(connectionId)
      if (state[nodeId]) {
        state[nodeId].error = error
        state[nodeId].loading = false
      }
    },
  },
})

export default memorySlice.reducer
export const {
  memoryUsageRequested,
  memoryUsageFulfilled,
  memoryUsageError,
} = memorySlice.actions
