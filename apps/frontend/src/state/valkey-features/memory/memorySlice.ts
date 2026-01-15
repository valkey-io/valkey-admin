import { createSlice } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectMemoryUsage =
  (connectionId: string) =>
    (state: RootState) =>
      R.path([VALKEY.MEMORY.name, connectionId, "data"], state)

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
  [connectionId: string]: {
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
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          data: null,
          loading: false,
        }
      }
      state[connectionId].loading = true
    },
    memoryUsageFulfilled: (state, action) => {
      const { connectionId, parsedResponse } = action.payload

      // validating that parsedResponse is an object (not an array, not null)
      if (parsedResponse && typeof parsedResponse === "object" && !Array.isArray(parsedResponse)) {
        state[connectionId].data = parsedResponse
      } else {
        console.error("Invalid memory usage response format:", parsedResponse)
        state[connectionId].data = null
        state[connectionId].error = { message: "Invalid data format received" }
      }
      state[connectionId].loading = false
    },
    memoryUsageError: (state, action) => {
      const { connectionId, error } = action.payload
      if (state[connectionId]) {
        state[connectionId].error = error
        state[connectionId].loading = false
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
