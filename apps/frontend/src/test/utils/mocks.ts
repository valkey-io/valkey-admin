import { CONNECTED } from "@common/src/constants"
import type { ConnectionState } from "@/state/valkey-features/connection/connectionSlice"

export const mockConnectionState = (
  overrides?: Partial<ConnectionState>,
): ConnectionState => ({
  status: CONNECTED,
  errorMessage: null,
  connectionDetails: {
    host: "localhost",
    port: "6379",
    username: "",
    password: "",
    alias: "Test Connection",
    keyEvictionPolicy: "allkeys-lru",
    clusterSlotStatsEnabled: false,
    jsonModuleAvailable: false,
  },
  connectionHistory: [
    {
      timestamp: Date.now(),
      event: "Connected",
    },
  ],
  ...overrides,
})

export const mockWebSocketState = (overrides?: object) => ({
  status: CONNECTED,
  errorMessage: null,
  reconnect: {
    isRetrying: false,
    currentAttempt: 0,
    maxRetries: 8,
    nextRetryDelay: null,
  },
  ...overrides,
})

export const mockKeyBrowserState = (overrides?: object) => ({
  keys: [],
  cursor: "0",
  loading: false,
  error: null,
  keyTypeLoading: {},
  totalKeys: 0,
  ...overrides,
})

export const mockValkeyKey = (overrides?: object) => ({
  key: "test:key:1",
  type: "String",
  ttl: -1,
  size: 10,
  ...overrides,
})

export const mockClusterNode = (overrides?: object) => ({
  id: "node-1",
  host: "localhost",
  port: 7000,
  role: "primary",
  slots: [[0, 5460]],
  replicas: [],
  ...overrides,
})
