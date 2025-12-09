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
  }
}

const initialCommandLogsState: CommandLogState = {}

const commandLogsSlice = createSlice({
  name: "commandLogs",
  initialState: initialCommandLogsState,
  reducers: {
    commandLogsRequested: (state, action) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = {
          logs: {
            slow: [],
            [COMMANDLOG_TYPE.LARGE_REQUEST]: [],
            [COMMANDLOG_TYPE.LARGE_REPLY]: [],
          },
          count: 50,
          loading: false,
        }
      }
      state[connectionId].loading = true
    },
    commandLogsFulfilled: (state, action) => {
      const { connectionId, parsedResponse } = action.payload
      const commandLogType : CommandLogType = action.payload.commandLogType
      const { rows, count } = parsedResponse

      state[connectionId].logs[commandLogType] = rows
      state[connectionId].count = count
      state[connectionId].loading = false
    },
    commandLogsError: (state, action) => {
      const { connectionId, error } = action.payload
      if (state[connectionId]) {
        state[connectionId].error = error
        state[connectionId].loading = false
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
