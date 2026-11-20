import { createSlice, type PayloadAction, nanoid } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import type { RootState } from "@/store.ts"

export const selectMemoryUsage =
  (connectionId: string) =>
    (state: RootState) =>
      R.path([VALKEY.MEMORY.name, connectionId, "data"], state)

export const selectMemoryUsageLoading =
  (connectionId: string) =>
    (state: RootState) =>
      R.pathOr(false, [VALKEY.MEMORY.name, connectionId, "loading"], state)

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
    lastRequestId?: string
  }
}

const initialMemoryState: MemoryState = {}

interface MemoryUsageRequestedPayload {
  connectionId: string
  clusterId?: string
  timeRange?: number
  requestId: string
}

interface MemoryUsageFulfilledPayload {
  connectionId: string
  parsedResponse: unknown
  requestId?: string
}

interface MemoryUsageErrorPayload {
  connectionId: string
  error: JSONObject
  requestId?: string
}

const memorySlice = createSlice({
  name: "memory",
  initialState: initialMemoryState,
  reducers: {
    memoryUsageRequested: {
      reducer: (state, action: PayloadAction<MemoryUsageRequestedPayload>) => {
        const { connectionId, requestId } = action.payload
        if (!state[connectionId]) {
          state[connectionId] = {
            data: null,
            loading: false,
          }
        }
        state[connectionId].loading = true
        state[connectionId].lastRequestId = requestId
      },
      prepare: (payload: { connectionId: string; clusterId?: string; timeRange?: number; requestId?: string }) => ({
        payload: {
          ...payload,
          requestId: payload.requestId ?? nanoid(),
        },
      }),
    },
    memoryUsageFulfilled: (state, action: PayloadAction<MemoryUsageFulfilledPayload>) => {
      const { connectionId, parsedResponse, requestId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          data: null,
          loading: false,
        }
      }
      // If a requestId is provided and does not match the latest request, ignore it to prevent race conditions (#590)
      if (requestId && state[connectionId].lastRequestId && requestId !== state[connectionId].lastRequestId) {
        return
      }
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
    memoryUsageError: (state, action: PayloadAction<MemoryUsageErrorPayload>) => {
      const { connectionId, error, requestId } = action.payload
      if (state[connectionId]) {
        if (requestId && state[connectionId].lastRequestId && requestId !== state[connectionId].lastRequestId) {
          return
        }
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
