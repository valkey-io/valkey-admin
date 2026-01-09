import { CONNECTED, CONNECTING, ERROR, NOT_CONNECTED } from "@common/src/constants"
import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

interface ReconnectState {
  isRetrying: boolean
  currentAttempt: number
  maxRetries: number
  nextRetryDelay: number | null
}

export interface WsConnectionState {
  status: typeof NOT_CONNECTED | typeof CONNECTED | typeof CONNECTING | typeof ERROR
  errorMessage: string | null
  reconnect: ReconnectState
}

const wsConnectionSlice = createSlice({
  name: "wsconnection",
  initialState: {
    status: NOT_CONNECTED,
    errorMessage: null,
    reconnect: {
      isRetrying: false,
      currentAttempt: 0,
      maxRetries: 8,
      nextRetryDelay: null,
    },
  } as WsConnectionState,
  reducers: {
    connectPending: (state) => {
      state.status = CONNECTING
      state.errorMessage = null
    },
    connectFulfilled: (state) => {
      state.status = CONNECTED
      state.errorMessage = null
    },
    connectRejected: (state, action) => {
      state.status = ERROR
      state.errorMessage = action.payload?.message || "Server error"
      state.reconnect.isRetrying = false
    },
    reconnectAttempt: (state, action: PayloadAction<{
      attempt: number
      maxRetries: number
      nextRetryDelay: number
    }>) => {
      state.reconnect.isRetrying = true
      state.reconnect.currentAttempt = action.payload.attempt
      state.reconnect.maxRetries = action.payload.maxRetries
      state.reconnect.nextRetryDelay = action.payload.nextRetryDelay
      state.status = CONNECTING
    },
    reconnectFailed: (state, action: PayloadAction<{ error: string }>) => {
      state.reconnect.isRetrying = false
      state.errorMessage = action.payload.error
    },
    reconnectExhausted: (state) => {
      state.status = ERROR
      state.reconnect.isRetrying = false
      state.errorMessage = "Maximum reconnection attempts reached"
    },
    resetConnection: (state) => {
      state.status = NOT_CONNECTED
      state.errorMessage = null
      state.reconnect = {
        isRetrying: false,
        currentAttempt: 0,
        maxRetries: 8,
        nextRetryDelay: null,
      }
    },
  },
})

export default wsConnectionSlice.reducer
export const { 
  connectPending, 
  connectFulfilled, 
  connectRejected, 
  reconnectAttempt,
  reconnectFailed,
  reconnectExhausted,
  resetConnection, 
} = wsConnectionSlice.actions
