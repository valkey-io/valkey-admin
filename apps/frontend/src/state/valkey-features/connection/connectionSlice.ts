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
  alias?: string;
  role?: Role;
  clusterId?: string;
  // Eviction policy required for getting hot keys using hot slots
  lfuEnabled?: boolean;
  // JSON module availability check
  jsonModuleAvailable?: boolean;
}

interface ReconnectState {
  isRetrying: boolean;
  currentAttempt: number;
  maxRetries: number;
  nextRetryDelay?: number;
}

interface ConnectionHistoryEntry {
  timestamp: number;
  event: "Connected";
}

export interface ConnectionState {
  status: ConnectionStatus;
  errorMessage: string | null;
  connectionDetails: ConnectionDetails;
  reconnect?: ReconnectState;
  connectionHistory?: ConnectionHistoryEntry[];
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
        alias?: string;
        isRetry?: boolean;
      }>,
    ) => {
      const { connectionId, host, port, username = "", password = "", alias = "", isRetry = false } = action.payload
      const existingConnection = state.connections[connectionId]

      state.connections[connectionId] = {
        status: CONNECTING,
        errorMessage: isRetry && existingConnection?.errorMessage ? existingConnection.errorMessage : null,
        connectionDetails: { host, port, username, password, ...(alias && { alias }), lfuEnabled: false, jsonModuleAvailable: false },
        ...(isRetry && existingConnection?.reconnect && {
          reconnect: existingConnection.reconnect,
        }),
        // for preserving connection history
        ...(existingConnection?.connectionHistory && {
          connectionHistory: existingConnection.connectionHistory,
        }),
      }
    },
    standaloneConnectFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        connectionDetails: ConnectionDetails;
      }>,
    ) => {
      const { connectionId, connectionDetails } = action.payload
      const connectionState = state.connections[connectionId]
      if (connectionState) {
        connectionState.status = CONNECTED
        connectionState.errorMessage = null
        connectionState.connectionDetails.lfuEnabled = connectionDetails.lfuEnabled ?? connectionState.connectionDetails.lfuEnabled
        // eslint-disable-next-line max-len
        connectionState.connectionDetails.jsonModuleAvailable = connectionDetails.jsonModuleAvailable ?? connectionState.connectionDetails.lfuEnabled

        // keep track of connection history
        connectionState.connectionHistory ??= []
        connectionState.connectionHistory.push({
          timestamp: Date.now(),
          event: CONNECTED,
        })
      }
    },
    clusterConnectFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        clusterNodes: Record<string, ConnectionDetails>;
        clusterId: string;
        lfuEnabled: boolean;
        jsonModuleAvailable: boolean;
      }>,
    ) => {
      const { connectionId, clusterId, lfuEnabled, jsonModuleAvailable } = action.payload
      const connectionState = state.connections[connectionId]
      if (connectionState) {
        connectionState.status = CONNECTED
        connectionState.errorMessage = null
        connectionState.connectionDetails.clusterId = clusterId
        connectionState.connectionDetails.lfuEnabled = lfuEnabled
        connectionState.connectionDetails.jsonModuleAvailable = jsonModuleAvailable
        // Clear retry state on successful connection
        delete connectionState.reconnect

        // keep track of connection history
        connectionState.connectionHistory ??= []
        connectionState.connectionHistory.push({
          timestamp: Date.now(),
          event: CONNECTED,
        })
      }
    },
    connectRejected: (state, action) => {
      const { connectionId, errorMessage } = action.payload
      if (state.connections[connectionId]) {
        const existingConnection = state.connections[connectionId]
        const isRetrying = existingConnection.reconnect?.isRetrying

        state.connections[connectionId].status = ERROR
        // Preserve original error message during retry attempts
        if (isRetrying && existingConnection.errorMessage) {
          state.connections[connectionId].errorMessage = existingConnection.errorMessage
        } else {
          state.connections[connectionId].errorMessage = errorMessage || "Valkey error: Unable to connect."
        }
      }
    },
    startRetry: (state, action) => {
      const { connectionId, attempt, maxRetries, nextRetryDelay } = action.payload
      if (state.connections[connectionId]) {
        state.connections[connectionId].reconnect = {
          isRetrying: true,
          currentAttempt: attempt,
          maxRetries,
          nextRetryDelay,
        }
      }
    },
    stopRetry: (state, action) => {
      const { connectionId } = action.payload
      if (state.connections[connectionId]?.reconnect) {
        state.connections[connectionId].reconnect!.isRetrying = false
      }
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
  standaloneConnectFulfilled,
  clusterConnectFulfilled,
  connectRejected,
  connectionBroken,
  closeConnection,
  updateConnectionDetails,
  deleteConnection,
  startRetry,
  stopRetry,
} = connectionSlice.actions
