import { createSlice } from "@reduxjs/toolkit";
import type { RootState } from "../../store";

export const selectStatus = (state: RootState) => state.websocket.status

const wsConnectionSlice = createSlice({
    name: 'wsconnection',
    initialState: {
        status: "Not Connected"
    },
    reducers: {
        setConnected: (state, action) => {
            state.status = action.payload ? "Connected" : "Not Connected"

        },
        setConnecting: (state, action) => {
            state.status = action.payload.status ? "Connecting..." : "Not Connected"
        },
        setError: (state, action) => {
            state.status = "Connection Failed: " + action.payload
        }
    }
})

export default wsConnectionSlice.reducer
export const { setConnected, setConnecting, setError } = wsConnectionSlice.actions