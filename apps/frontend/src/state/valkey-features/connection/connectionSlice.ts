import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { CONNECTED, CONNECTING, ERROR, LOCAL_STORAGE, NOT_CONNECTED, VALKEY, DISCONNECTED } from "@common/src/constants.ts"
import * as R from "ramda"

type ConnectionStatus = typeof NOT_CONNECTED | typeof CONNECTED | typeof CONNECTING | typeof ERROR | typeof DISCONNECTED;
type Role = "primary" | "replica";

interface ConnectionDetails {
  host: string;
  port: string;
  username: string;
  password: string;
  role?: Role;
  clusterId?: string;
}

export interface ConnectionState {
  status: ConnectionStatus;
  errorMessage: string | null;
  connectionDetails: ConnectionDetails;
  clusterNodes?: Record<string, ConnectionDetails>;
}

interface ValkeyConnectionsState {
  [connectionId: string]: ConnectionState
}

const currentConnections = R.pipe(
  (v: string) => localStorage.getItem(v),
  (s) => (s === null ? {} : JSON.parse(s)),
)(LOCAL_STORAGE.VALKEY_CONNECTIONS)

const connectionSlice = createSlice({
  name: VALKEY.CONNECTION.name,
  initialState: {
    connections: currentConnections as ValkeyConnectionsState,
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
      }>,
    ) => {
      const { connectionId, host, port, username = "", password = "" } = action.payload
      state.connections[connectionId] = {
        status: CONNECTING,
        errorMessage: null,
        connectionDetails: { host, port, username, password },
      }
    },
    connectFulfilled: (state, action) => {
      const { connectionId, clusterNodes, clusterId } = action.payload
      const connectionState = state.connections[connectionId]
      if (connectionState) {
        connectionState.status = CONNECTED
        connectionState.errorMessage = null
        connectionState.clusterNodes = clusterNodes
        connectionState.connectionDetails.clusterId = clusterId
      }
    },
    connectRejected: (state, action) => {
      const { connectionId } = action.payload
      state.connections[connectionId].status = ERROR
      state.connections[connectionId].errorMessage = action.payload || "Unknown error"
    },
    connectionBroken: (state, action) => {
      const { connectionId } = action.payload
      if (state.connections[connectionId]) {
        state.connections[connectionId].status = DISCONNECTED
        state.connections[connectionId].errorMessage = "Connection lost"
      }
    },
    closeConnection: (state, action) => {
      console.log(action)
      const { connectionId } = action.payload
      state.connections[connectionId].status = NOT_CONNECTED
      state.connections[connectionId].errorMessage = null
    },
    updateConnectionDetails: (state, action) => {
      const { connectionId } = action.payload
      state.connections[connectionId].connectionDetails = {
        ...state.connections[connectionId].connectionDetails,
        ...action.payload,
      }
    },
    deleteConnection: (state, action) => {
      const { connectionId } = action.payload
      return R.dissocPath(["connections", connectionId], state)
    },
  },
})

export default connectionSlice.reducer
export const { 
  connectPending, 
  connectFulfilled, 
  connectRejected, 
  connectionBroken,
  closeConnection, 
  updateConnectionDetails, 
  deleteConnection, 
} = connectionSlice.actions
