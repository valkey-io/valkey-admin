// TODO: merge with common/src/constants.ts

export const MONITOR = "monitor"
export const COMMANDLOG_SLOW = "commandlog_slow"
export const COMMANDLOG_LARGE_REPLY = "commandlog_large_reply"
export const COMMANDLOG_LARGE_REQUEST = "commandlog_large_request"

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
