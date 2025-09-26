import { CONNECTED, CONNECTING, ERROR, NOT_CONNECTED } from "@common/src/constants"
import { createSlice } from "@reduxjs/toolkit"

const wsConnectionSlice = createSlice({
  name: "wsconnection",
  initialState: {
    status: NOT_CONNECTED,
    errorMessage: null,
  },
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
      state.errorMessage = action.payload || "Unknown error"
    },
    resetConnection: (state) => {
      state.status = NOT_CONNECTED
      state.errorMessage = null
    },
  },
})

export default wsConnectionSlice.reducer
export const { connectPending, connectFulfilled, connectRejected, resetConnection } = wsConnectionSlice.actions
