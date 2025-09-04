import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { CONNECTED, VALKEY } from "@common/src/constants.ts"

type ConnectionStatus = "Idle" | "Connecting" | "Connected" | "Error";

interface ConnectionDetails {
    host: string;
    port: string;
    username: string;
    password: string;
}

interface ConnectionState {
    status: ConnectionStatus;
    errorMessage: string | null;
    hasRedirected: boolean;
    connectionDetails: ConnectionDetails;
}

interface ValkeyConnectionsState {
    [connectionId: string]: ConnectionState
}

const connectionSlice = createSlice({
    name: VALKEY.CONNECTION.name,
    initialState: {
        connections: {} as ValkeyConnectionsState
    },
    reducers: {
        connectPending: (
            state,
            action: PayloadAction<{
                connectionId: string;
                host: string;
                port: string;
                username?: string;
                password?: string;
            }>
        ) => {
            const { connectionId, host, port, username = "", password = "" } = action.payload;
            state.connections[connectionId] = {
                status: "Connecting",
                errorMessage: null,
                hasRedirected: false,
                connectionDetails: { host, port, username, password },
            };
        },
        connectFulfilled: (state, action) => {
            const { connectionId } = action.payload;
            if (state.connections[connectionId]) {
                state.connections[connectionId].status = CONNECTED;
                state.connections[connectionId].errorMessage = null;
            }
        },
        connectRejected: (state, action) => {
            const { connectionId } = action.payload;
            state.connections[connectionId].status = "Error";
            state.connections[connectionId].errorMessage = action.payload || "Unknown error";
        },
        setRedirected: (state, action) => {
            const { connectionId } = action.payload;
            state.connections[connectionId].hasRedirected = action.payload;
        },
        resetConnection: (state, action) => {
            const { connectionId } = action.payload;
            state.connections[connectionId].status = "Idle";
            state.connections[connectionId].errorMessage = null;
        },
        updateConnectionDetails: (state, action) => {
            const { connectionId } = action.payload;
            state.connections[connectionId].connectionDetails = {
                ...state.connections[connectionId].connectionDetails,
                ...action.payload,
            };
        },
    }
})

export default connectionSlice.reducer
export const { connectPending, connectFulfilled, connectRejected, setRedirected, resetConnection, updateConnectionDetails } = connectionSlice.actions
