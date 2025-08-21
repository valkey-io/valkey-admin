import { createSlice } from "@reduxjs/toolkit";
import {VALKEY} from "@common/src/constants.ts"

const valkeyConnectionSlice = createSlice({
    name: VALKEY.CONNECTION.name,
    initialState: {
        status: "Not Connected",
        connected: false,
        connecting: false,
        hasRedirected: false
    },
    reducers: {
        setConnected: (state, action) => {
            state.status = action.payload.status ? "Connected" : "Not Connected"
            state.connected = action.payload.status
            state.connecting = action.payload.status ? false : state.connecting
        },
        setConnecting: (state, action) => {
            state.status = "Connecting..."
            state.connecting = action.payload.status
        },
        setError: (state, action) => {
            state.status = "Error" + action.payload
            state.connecting = false
        },
        setRedirected: (state, action) => {
            state.hasRedirected = action.payload
        }
    }
})

export default valkeyConnectionSlice.reducer
export const { setConnected, setConnecting, setError, setRedirected } = valkeyConnectionSlice.actions