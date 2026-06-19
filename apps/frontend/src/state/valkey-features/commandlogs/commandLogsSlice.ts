import { createSlice } from "@reduxjs/toolkit"
import { type JSONObject } from "@common/src/json-utils"
import { VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"
import { COMMANDLOG_TYPE } from "@common/src/constants.ts"
import type { RootState } from "@/store.ts"

type CommandLogType = typeof COMMANDLOG_TYPE.SLOW | typeof COMMANDLOG_TYPE.LARGE_REQUEST | typeof COMMANDLOG_TYPE.LARGE_REPLY

export const selectCommandLogs =
  (connectionId: string, type: CommandLogType) =>
    (state: RootState) =>
      R.path([VALKEY.COMMANDLOGS.name, connectionId, "logs", type], state)

export const selectCommandLogsNodeErrors =
  (connectionId: string) =>
    (state: RootState) =>
      R.path([VALKEY.COMMANDLOGS.name, connectionId, "nodeErrors"], state) ?? []

interface CommandLogSlowEntry {
  id: string
  ts: number
  duration_us: number
  argv: string[]
  addr: string
  client: string
}

interface CommandLogLargeEntry {
  id: string
  ts: number
  size: number
  argv: string[]
  addr: string
  client: string
}

interface CommandLogEntry {
  ts: number, 
  metric: string,
  values: CommandLogLargeEntry[]
}

interface CommandLogState {
  [connectionId: string]: {
    logs: {
      slow: Array<{
        ts: number
        metric: string
        values: CommandLogSlowEntry[]
      }>
      [COMMANDLOG_TYPE.LARGE_REPLY]: CommandLogEntry[],
      [COMMANDLOG_TYPE.LARGE_REQUEST]: CommandLogEntry[],
    }
    count: number
    error?: JSONObject | null
    loading?: boolean
    nodeErrors?: { nodeId: string; error: string }[]
  }
}

const initialCommandLogsState: CommandLogState = {}

const commandLogsSlice = createSlice({
  name: "commandLogs",
  initialState: initialCommandLogsState,
  reducers: {
    commandLogsRequested: (state, action) => {
      const { connectionId, clusterId } = action.payload
      const id = clusterId ?? connectionId
      if (!state[id]) {
        state[id] = {
          logs: {
            slow: [],
            [COMMANDLOG_TYPE.LARGE_REQUEST]: [],
            [COMMANDLOG_TYPE.LARGE_REPLY]: [],
          },
          count: 50,
          loading: false,
        }
      }
      state[id].loading = true
    },
    commandLogsFulfilled: (state, action) => {
      const { parsedResponse, nodeErrors } = action.payload
      const key = action.payload.clusterId ?? action.payload.connectionId
      const commandLogType: CommandLogType = action.payload.commandLogType
      const { rows, count } = parsedResponse
      if (!state[key]) {
        state[key] = {
          logs: {
            slow: [],
            [COMMANDLOG_TYPE.LARGE_REQUEST]: [],
            [COMMANDLOG_TYPE.LARGE_REPLY]: [],
          },
          count: 50,
          loading: false,
        }
      }
      state[key].logs[commandLogType] = rows
      state[key].count = count
      state[key].loading = false
      state[key].nodeErrors = nodeErrors ?? []
    },
    commandLogsError: (state, action) => {
      const { error } = action.payload
      const key = action.payload.clusterId ?? action.payload.connectionId
      if (state[key]) {
        state[key].error = error
        state[key].loading = false
      }
    },
  },
})

export default commandLogsSlice.reducer
export const {
  commandLogsRequested,
  commandLogsFulfilled,
  commandLogsError,
} = commandLogsSlice.actions
