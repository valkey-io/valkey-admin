// TODO: merge with common/src/constants.ts

export const MONITOR = "monitor"
export const MEMORY = "memory"
export const CPU = "cpu"
export const SLOWLOG_LEN = "slowlog_len"
export const COMMANDLOG_SLOW = "commandlog_slow"
export const COMMANDLOG_LARGE_REPLY = "commandlog_large_reply"
export const COMMANDLOG_LARGE_REQUEST = "commandlog_large_request"

/**
 * The collection streams ("epics"), one identifier per data kind.
 */
export const EPIC_KINDS = [
  MEMORY,
  CPU,
  SLOWLOG_LEN,
  COMMANDLOG_SLOW,
  COMMANDLOG_LARGE_REPLY,
  COMMANDLOG_LARGE_REQUEST,
  MONITOR,
]

export const ALLKEYS_LFU = "allkeys-lfu"
export const VOLATILE_LFU = "volatile-lfu"

export const MODE = {
  CONTINUOUS: "continuous",
}

export const ACTION = {
  START: "start",
  STOP: "stop",
  STATUS: "status",
}

export const COMMANDLOG_TYPE = {
  SLOW: "slow",
  LARGE_REQUEST: "large-request",
  LARGE_REPLY: "large-reply",
}
