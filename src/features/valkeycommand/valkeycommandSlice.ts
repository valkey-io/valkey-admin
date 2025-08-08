import { createSlice } from "@reduxjs/toolkit";

const valkeycommandSlice = createSlice({
    name: 'valkeycommand',
    initialState: {
        lastCommand: "",
        response: null,
        pending: false,
        error: null
    },
    reducers: {
        sendFulfilled: (state, action) => {
            state.response = action.payload
            state.pending = false
        },
        sendPending: (state, action) => {
            state.lastCommand = action.payload.command
            state.pending = action.payload.pending
            state.response = null
        },
        sendFailed: (state, action) => {
            state.error = action.payload
            state.pending = false
        }
    }
})

export default valkeycommandSlice.reducer;
export const { sendFulfilled, sendPending, sendFailed } = valkeycommandSlice.actions