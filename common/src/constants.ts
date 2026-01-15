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
} as const

export const CONNECTED = "Connected"
export const CONNECTING = "Connecting"
export const ERROR = "Error"
export const NOT_CONNECTED = "Not Connected"
export const DISCONNECTED = "Disconnected"
export const RECONNECTING = "Reconnecting"

export const PENDING = "Pending"
export const FULFILLED = "Fulfilled"

export const LOCAL_STORAGE = {
  VALKEY_CONNECTIONS: "VALKEY_CONNECTIONS",
}

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

export const VALKEY_CLIENT = {
  SCAN: {
    defaultPayloadPattern: "*",
    defaultCount: 50,
  } ,
}
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
