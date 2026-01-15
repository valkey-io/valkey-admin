import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import {
  CONNECTED,
  CONNECTING,
  DISCONNECTED,
  ERROR,
  LOCAL_STORAGE,
  NOT_CONNECTED,
  VALKEY,
  type KeyEvictionPolicy
} from "@common/src/constants"
import * as R from "ramda"

type ConnectionStatus = typeof NOT_CONNECTED | typeof CONNECTED | typeof CONNECTING | typeof ERROR | typeof DISCONNECTED;
type Role = "primary" | "replica";

export interface ConnectionDetails {
  host: string;
  port: string;
  username?: string;
  password?: string;
  tls: boolean;
  verifyTlsCertificate: boolean
  //TODO: Add handling and UI for uploading cert
  caCertPath?: string
  alias?: string;
  role?: Role;
  clusterId?: string;
  // Eviction policy required for getting hot keys using hot slots
  keyEvictionPolicy?: KeyEvictionPolicy;
  clusterSlotStatsEnabled?: boolean
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
  wasEdit?: boolean;
}

export interface ValkeyConnectionsState {
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
        connectionDetails: ConnectionDetails;
        isRetry?: boolean;
        isEdit?: boolean;
        preservedHistory?: ConnectionHistoryEntry[];
      }>,
    ) => {
      const {
        connectionId,
        connectionDetails,
        isRetry = false,
        isEdit = false,
        preservedHistory,
      } = action.payload
      const existingConnection = state.connections[connectionId]

      state.connections[connectionId] = {
        status: CONNECTING,
        errorMessage: isRetry && existingConnection?.errorMessage ? existingConnection.errorMessage : null,
        connectionDetails: {
          ...connectionDetails,
          clusterSlotStatsEnabled: false,
          jsonModuleAvailable: false,
        },

        wasEdit: isEdit,
        ...(isRetry && existingConnection?.reconnect && {
          reconnect: existingConnection.reconnect,
        }),
        // for preserving connection history - use preserved history if provided, otherwise existing
        connectionHistory: preservedHistory || existingConnection?.connectionHistory,
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

        if (connectionDetails) {
          connectionState.connectionDetails.keyEvictionPolicy = connectionDetails.keyEvictionPolicy
          connectionState.connectionDetails.jsonModuleAvailable = connectionDetails.jsonModuleAvailable ??
          connectionState.connectionDetails.jsonModuleAvailable
        }

        connectionState.connectionHistory ??= []
        connectionState.connectionHistory.push({
          timestamp: Date.now(),
          event: CONNECTED,
        })
        delete connectionState.wasEdit
      }
    },
    clusterConnectFulfilled: (
      state,
      action: PayloadAction<{
        connectionId: string;
        clusterNodes: Record<string, ConnectionDetails>;
        clusterId: string;
        keyEvictionPolicy: KeyEvictionPolicy;
        clusterSlotStatsEnabled: boolean;
        jsonModuleAvailable: boolean;
      }>,
    ) => {
      const { connectionId, clusterId, keyEvictionPolicy, clusterSlotStatsEnabled, jsonModuleAvailable } = action.payload
      const connectionState = state.connections[connectionId]
      if (connectionState) {
        connectionState.status = CONNECTED
        connectionState.errorMessage = null
        connectionState.connectionDetails.clusterId = clusterId
        connectionState.connectionDetails.keyEvictionPolicy = keyEvictionPolicy
        connectionState.connectionDetails.clusterSlotStatsEnabled = clusterSlotStatsEnabled
        connectionState.connectionDetails.jsonModuleAvailable = jsonModuleAvailable

        // Clear retry state on successful connection
        delete connectionState.reconnect

        // keep track of connection history
        connectionState.connectionHistory ??= []
        connectionState.connectionHistory.push({
          timestamp: Date.now(),
          event: CONNECTED,
        })
        // Clear the wasEdit flag after successful connection
        delete connectionState.wasEdit
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
    deleteConnection: (state, action: PayloadAction<{ connectionId: string; silent?: boolean }>) => {
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
