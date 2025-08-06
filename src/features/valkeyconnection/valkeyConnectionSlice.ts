import { createSlice } from "@reduxjs/toolkit";
import type { RootState } from "../../store";

export const selectStatus = (state: RootState) => state.valkeyconnection.status
export const selectConnected = (state: RootState) => state.valkeyconnection.connected
export const selectConnecting = (state: RootState) => state.valkeyconnection.connecting

const valkeyConnectionSlice = createSlice({
    name: 'valkeyconnection',
    initialState: {
        status: "Not Connected",
        connected: false,
        connecting: false,
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
        }
    }
})

export default valkeyConnectionSlice.reducer
export const { setConnected, setConnecting, setError } = valkeyConnectionSlice.actions