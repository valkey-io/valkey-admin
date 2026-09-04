const commonDefs = {
  setError: "error",
} as const

type WithError<T extends Record<string, string>> = { setError: "error" } & T

export const makeNamespace = <
  const Prefix extends string,
  const Defs extends Record<string, string>
>(
  name: Prefix,
  defs: Defs,
) =>
  ({
    name,
    ...Object.fromEntries(
      Object.entries({ ...commonDefs, ...defs } as WithError<Defs>)
        .map(([k, v]) => [k, `${name}/${v}` as const]),
    ),
  }) as {
    name: Prefix
  } & { [K in keyof WithError<Defs>]: `${Prefix}/${WithError<Defs>[K]}` }

export const VALKEY = {
  CONNECTION: makeNamespace("valkeyConnection", {
    connectPending: "connectPending",
    standaloneConnectFulfilled: "standaloneConnectFulfilled",
    clusterConnectFulfilled: "clusterConnectFulfilled",
    connectRejected: "connectRejected",
    resetConnection: "resetConnection",
    closeConnection: "closeConnection",
    closeConnectionFulfilled: "closeConnectionFulfilled",
    closeConnectionFailed: "closeConnectionFailed",
  } as const),
  TOPOLOGY: makeNamespace("valkeyTopology", {
    discoveryEndpointPending: "discoveryEndpointPending",
    discoveryEndpointFulfilled: "discoveryEndpointFulfilled",
    discoveryEndpointRejected: "discoveryEndpointRejected",
    clearEndpointDiscovery: "clearEndpointDiscovery",
  } as const),
  COMMAND: makeNamespace("valkeyCommand", {
    sendFailed: "sendFailed",
    sendFulfilled: "sendFulfilled",
    sendRequested: "sendRequested",
  } as const),
  STATS: makeNamespace("valkeyStats", {
    setData: "setData",
  } as const),
  KEYS: makeNamespace("keyBrowser", {
    getKeysRequested: "getKeysRequested",
    getKeysFulfilled: "getKeysFulfilled",
    getKeysFailed: "getKeysFailed",
    getKeyTypeRequested: "getKeyTypeRequested",
    getKeyTypeFulfilled: "getKeyTypeFulfilled",
    getKeyTypeFailed: "getKeyTypeFailed",
    deleteKeyRequested: "deleteKeyRequested",
    deleteKeyFulfilled: "deleteKeyFulfilled",
    deleteKeyFailed: "deleteKeyFailed",
    addKeyRequested: "addKeyRequested",
    addKeyFulfilled: "addKeyFulfilled",
    addKeyFailed: "addKeyFailed",
    updateKeyRequested: "updateKeyRequested",
    updateKeyFulfilled: "updateKeyFulfilled",
    updateKeyFailed: "updateKeyFailed",
  } as const),
  CLUSTER: makeNamespace( "valkeyCluster", {
    addCluster: "addCluster",
    updateClusterInfo: "updateClusterInfo",
    deleteCluster: "deleteCluster",
    setClusterData: "setClusterData",
  } as const),
  HOTKEYS: makeNamespace( "hotKeys",{
    hotKeysRequested: "hotKeysRequested",
    hotKeysFulfilled: "hotKeysFulfilled",
    hotKeysError: "hotKeysError",
  }),
  BIGKEYS: makeNamespace( "bigKeys",{
    bigKeysRequested: "bigKeysRequested",
    bigKeysFulfilled: "bigKeysFulfilled",
    bigKeysError: "bigKeysError",
  }),
  COMMANDLOGS: makeNamespace( "commandLogs",{
    commandLogsRequested: "commandLogsRequested",
    commandLogsFulfilled: "commandLogsFulfilled",
    commandLogsError: "commandLogsError",
  }),
  CONFIG: makeNamespace("config", {
    setConfig: "setConfig",
    updateConfig: "updateConfig",
    updateConfigFulfilled: "updateConfigFulfilled",
    updateConfigFailed: "updateConfigFailed",
    updateConfigNodeStatus: "updateConfigNodeStatus",
    enableClusterSlotStats: "enableClusterSlotStats",
  }),
  CPU: makeNamespace( "cpu",{
    cpuUsageRequested: "cpuUsageRequested",
    cpuUsageFulfilled: "cpuUsageFulfilled",
    cpuUsageError: "cpuUsageError",
  }),
  MEMORY: makeNamespace( "memory",{
    memoryUsageRequested: "memoryUsageRequested",
    memoryUsageFulfilled: "memoryUsageFulfilled",
    memoryUsageError: "memoryUsageError",
  }),
  MONITOR: makeNamespace("monitor", {
    monitorRequested: "monitorRequested",
    monitorFulfilled: "monitorFulfilled",
    monitorError: "monitorError",
  }),
} as const

// check truthyness in case process doesn't have env
const nodeEnv = typeof process !== "undefined" && process.env ? process.env : {}

// Metrics server constants and not ready state handling
export const METRICS_SERVER_NOT_READY = "METRICS_SERVER_NOT_READY"
export const METRICS_RETRY_INTERVAL_MS = 1000
export const METRICS_MAX_RETRIES = 10

// Compare CPU samples collected roughly 5 seconds apart
export const CLUSTER_DATA_POLL_INTERVAL_MS = 5000

// Utilization bands for cluster topology node metrics.
// Memory is a share of the node's limit; CPU is a share of one core.
export const MEMORY_HIGH_THRESHOLD = 90
export const MEMORY_NORMAL_THRESHOLD = 70
export const CPU_HIGH_THRESHOLD = 85
export const CPU_NORMAL_THRESHOLD = 60

export const CONNECTED = "Connected"
export const CONNECTING = "Connecting"
export const ERROR = "Error"
export const NOT_CONNECTED = "Not Connected"
export const DISCONNECTED = "Disconnected"
export const RECONNECTING = "Reconnecting"
export const DISCONNECTING = "Disconnecting"
export const MAX_CONNECTIONS = nodeEnv.MAX_CONNECTIONS
  ? Number(nodeEnv.MAX_CONNECTIONS)
  : Infinity

export const PENDING = "Pending"
export const FULFILLED = "Fulfilled"

export const FETCH_TIMEOUT_MS = 10000

export const LOCAL_STORAGE = {
  VALKEY_CONNECTIONS: "VALKEY_CONNECTIONS",
}

export const SESSION_STORAGE = {
  VALKEY_COMMANDS: "VALKEY_COMMANDS",
}

// limit the number of commands persisted in session storage to avoid exceeding storage limits
export const PERSISTED_COMMANDS_LIMIT = 25

export const RETRY_CONFIG = {
  MAX_RETRIES: 8,
  BASE_DELAY: 1000,
  MAX_DELAY: 30000,
} as const

// fibonacci backoff
export const retryDelay = (retryCount: number): number => {
  let a = 1, b = 1
  for (let i = 2; i <= retryCount; i++) {
    [a, b] = [b, a + b]
  }

  const delay = RETRY_CONFIG.BASE_DELAY * b
  return Math.min(delay, RETRY_CONFIG.MAX_DELAY)
}

// Per-node fan-out timing (metrics requests to each cluster node).
export const PER_NODE_TIMEOUT_MS = 5000

// Default hard cap on automatic per-node retries in a fan-out retry session
// (total attempts = retries + 1). Callers may override per session.
export const DEFAULT_RETRY_MAX_RETRIES = 6

// Per-node reply message constraints and canonical messages.
export const MAX_NODE_MESSAGE_LEN = 1024
export const MISSING_MESSAGE = "Failure reason unavailable"
export const NODE_TIMEOUT_MESSAGE = "Node did not respond within 5000ms"
export const NOT_ATTEMPTED_MESSAGE =
  "No targeted node has a registered metrics process"

export const VALKEY_CLIENT = {
  SCAN: {
    defaultPayloadPattern: "*",
    defaultCount: 50,
  } ,
  // chunk size for paginating elements to avoid blocking due to keys with too many elements
  ELEMENT_PAGE_SIZE: 50, 
  KEY_VALUE_SIZE_LIMIT_BYTES: 2048, // 2KiB
  // max keys per pipeline batch to avoid overwhelming the server
  PIPELINE_CHUNK_SIZE: 500,
  MESSAGES: {
    NOT_READABLE: "Not human readable.",
  },
}
export const MONITOR_ACTION = {
  START: "start",
  STOP: "stop",
  STATUS: "status",
} as const

export type MonitorAction = typeof MONITOR_ACTION[keyof typeof MONITOR_ACTION]

export const COMMANDLOG_TYPE = {
  SLOW: "slow",
  LARGE_REQUEST: "large-request",
  LARGE_REPLY: "large-reply",
} as const

export const SORT_ORDER = {
  ASC: "asc",
  DESC: "desc",
} as const

export const SORT_FIELD = {
  TIMESTAMP: "timestamp",
  METRIC: "metric",
} as const

export const KEY_EVICTION_POLICY = {
  NO_EVICTION: "noeviction",
  ALLKEYS_LRU: "allkeys-lru",
  ALLKEYS_LFU: "allkeys-lfu",
  VOLATILE_LRU: "volatile-lru",
  VOLATILE_LFU: "volatile-lfu",
  ALLKEYS_RANDOM: "allkeys-random",
  VOLATILE_RANDOM: "volatile-random",
  VOLATILE_TTL: "volatile-ttl",
} as const

export type KeyEvictionPolicy =
  typeof KEY_EVICTION_POLICY[keyof typeof KEY_EVICTION_POLICY]

export const KEY_TYPES = {
  STRING: "String",
  LIST: "List",
  SET: "Set",
  ZSET: "ZSet",
  HASH: "Hash",
  STREAM: "Stream",
  JSON: "JSON",
}

export const MILLISECONDS_IN_A_DAY = 86_400_000

export const METRICS_EVICTION_POLICY = {
  INTERVAL: 1 * MILLISECONDS_IN_A_DAY,
}

/**
 * Bounds for the epic (collection stream) fields that `POST /update-config`
 * may tune. Shared so the metrics validator and the UI inputs that produce
 * these values cannot drift apart.
 *
 * Calibrated against `apps/metrics/config.yml`:
 *  - `data_retention_mb` below 1 MB yields a capacity smaller than a single
 *    file, which disables the writer's rotation and eviction
 *  - `poll_ms` below a second would hammer the node being sampled
 */
export const EPIC_FIELD_BOUNDS = {
  monitoringDuration: { min: 1, max: 3_600_000 },   // capture window, up to 1h
  monitoringInterval: { min: 1, max: MILLISECONDS_IN_A_DAY }, // pause between runs
  maxCommandsPerRun: { min: 1, max: 10_000_000 },
  cutoffFrequency: { min: 1, max: 1_000_000 },
  poll_ms: { min: 1_000, max: 3_600_000 },
  data_retention_mb: { min: 1, max: 10_240 },
  data_retention_days: { min: 1, max: 365 },
} as const

export type EndpointType = "node" | "cluster-endpoint"

export const CONNECTION_TEARDOWN_DELAY_MS = Number(nodeEnv.CONNECTION_TEARDOWN_DELAY_MS ?? 10000)

export const DEPLOYMENT_TYPE = {
  ELECTRON: "Electron",
  WEB: "Web",
  K8: "K8",
}

export const deploymentSuffix = () => {
  switch (process.env.DEPLOYMENT_MODE) {
    case DEPLOYMENT_TYPE.ELECTRON:
      return "electron"
    case DEPLOYMENT_TYPE.K8:
      return "k8s"
    default:
      return "web"
  }
}
