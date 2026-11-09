import { createSlice, type PayloadAction, nanoid } from "@reduxjs/toolkit"
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
    lastRequestId?: string
  }
}

const initialCpuState: CpuState = {}

interface CpuUsageRequestedPayload {
  connectionId: string
  clusterId?: string
  timeRange?: number
  requestId: string
}

interface CpuUsageFulfilledPayload {
  connectionId: string
  parsedResponse: unknown
  requestId?: string
}

interface CpuUsageErrorPayload {
  connectionId: string
  error: JSONObject
  requestId?: string
}

const cpuSlice = createSlice({
  name: "cpu",
  initialState: initialCpuState,
  reducers: {
    cpuUsageRequested: {
      reducer: (state, action: PayloadAction<CpuUsageRequestedPayload>) => {
        const { connectionId, requestId } = action.payload
        if (!state[connectionId]) {
          state[connectionId] = {
            data: [],
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
    cpuUsageFulfilled: (state, action: PayloadAction<CpuUsageFulfilledPayload>) => {
      const { connectionId, parsedResponse, requestId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          data: [],
          loading: false,
        }
      }
      // If a requestId is provided and does not match the latest request, ignore it to prevent race conditions (#590)
      if (requestId && state[connectionId].lastRequestId && requestId !== state[connectionId].lastRequestId) {
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
    cpuUsageError: (state, action: PayloadAction<CpuUsageErrorPayload>) => {
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

export default cpuSlice.reducer
export const {
  cpuUsageRequested,
  cpuUsageFulfilled,
  cpuUsageError,
} = cpuSlice.actions
