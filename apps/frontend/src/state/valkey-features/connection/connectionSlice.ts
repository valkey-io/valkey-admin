import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import {
  CONNECTED,
  CONNECTING,
  DISCONNECTING,
  DISCONNECTED,
  ERROR,
  LOCAL_STORAGE,
  NOT_CONNECTED,
  VALKEY,
  type KeyEvictionPolicy,
  type EndpointType
} from "@common/src/constants"
import * as R from "ramda"
import { secureStorage } from "@/utils/secureStorage"

type ConnectionStatus = typeof NOT_CONNECTED | typeof CONNECTED | typeof CONNECTING | typeof ERROR | typeof DISCONNECTED | typeof DISCONNECTING
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
  endpointType: EndpointType
  authType?: "password" | "iam"
  awsRegion?: string
  awsReplicationGroupId?: string
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
  searchableText: string;
  reconnect?: ReconnectState;
  connectionHistory?: ConnectionHistoryEntry[];
  wasEdit?: boolean;
  connectedNode?: { host: string; port: number } // Added to check which node the config endpoint connected to
}

export interface ValkeyConnectionsState {
  [connectionId: string]: ConnectionState
}

const buildSearchableText = (connectionId: string, details: ConnectionDetails) =>
  [connectionId, details.host, details.port, details.username, details.alias]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

const currentConnections = R.pipe(
  (v: string) => localStorage.getItem(v),
  (s) => (s === null ? {} : JSON.parse(s) as ValkeyConnectionsState),
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
          // Preserve "" (no-password connections) but strip real passwords if secure storage is unavailable
          password: (R.isNotNil(connectionDetails.password) && secureStorage.isAvailable()) || R.isEmpty(connectionDetails.password)
            ? connectionDetails.password
            : undefined,
          clusterSlotStatsEnabled: false,
          jsonModuleAvailable: false,
        },
        searchableText: buildSearchableText(connectionId, connectionDetails),
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
    clusterConnectFulfilled: (state, action) => {
      const { 
        connectionId, 
        address, 
        connectionDetails } = action.payload
      const { clusterId, keyEvictionPolicy, clusterSlotStatsEnabled, jsonModuleAvailable } = connectionDetails

      const connectionState = state.connections[connectionId]
      connectionState.status = CONNECTED
      connectionState.errorMessage = null
      connectionState.connectionDetails.clusterId = clusterId
      connectionState.connectionDetails.keyEvictionPolicy = keyEvictionPolicy
      connectionState.connectionDetails.clusterSlotStatsEnabled = clusterSlotStatsEnabled
      connectionState.connectionDetails.jsonModuleAvailable = jsonModuleAvailable
      if (address) connectionState.connectedNode = address
      delete connectionState.reconnect
      connectionState.connectionHistory ??= []
      connectionState.connectionHistory.push({ timestamp: Date.now(), event: CONNECTED })
      delete connectionState.wasEdit
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
      const { connectionId } = action.payload
      state.connections[connectionId].status = DISCONNECTING
      state.connections[connectionId].errorMessage = null
    },
    closeConnectionFulfilled: (state, action) => {
      const { connectionId } = action.payload
      if (state.connections[connectionId]) {
        state.connections[connectionId].status = NOT_CONNECTED
      }

    },
    closeConnectionFailed: (state, action) => {
      const { connectionId, errorMessage } = action.payload
      state.connections[connectionId].status = ERROR
      state.connections[connectionId].errorMessage = errorMessage
    },
    updateConnectionDetails: (state, action) => {
      const { connectionId, ...details } = action.payload
      const merged = {
        ...state.connections[connectionId].connectionDetails,
        ...details,
      }
      state.connections[connectionId].connectionDetails = merged
      state.connections[connectionId].searchableText = buildSearchableText(connectionId, merged)
    },
    deleteConnection: (state, { payload: { connectionId } }) => {
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
  closeConnectionFulfilled,
  closeConnectionFailed,
  startRetry,
  stopRetry,
} = connectionSlice.actions
