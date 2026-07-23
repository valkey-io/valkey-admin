import * as R from "ramda"
import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { PERSISTED_COMMANDS_LIMIT, SESSION_STORAGE, VALKEY } from "@common/src/constants.ts"
import type { JSONObject } from "@common/src/json-utils.ts"
import { deleteConnection } from "@/state/valkey-features/connection/connectionSlice.ts"

type CmdMeta = { command: string, connectionId: string }

export interface CommandMetadata {
  command: string
  error: JSONObject | null
  response: JSONObject | null
  isFulfilled: boolean
  timestamp: number
}

export interface CommandState {
  [id: string]: {
    pending: boolean
    commands: CommandMetadata[]
  }
}

const withMetadata = (command: string, response: JSONObject, isFulfilled = true): CommandMetadata => ({
  command,
  error: isFulfilled ? null : response,
  response: isFulfilled ? response : null,
  isFulfilled,
  timestamp: Date.now(),
})

const restoredState = (): CommandState => {
  try {
    const saved = sessionStorage.getItem(SESSION_STORAGE.VALKEY_COMMANDS)
    if (saved === null) return {}

    return R.map(
      (entry) => ({
        pending: false,
        commands: (entry?.commands ?? []).slice(0, PERSISTED_COMMANDS_LIMIT),
      }),
      JSON.parse(saved) as CommandState,
    )
  } catch (e) {
    console.error("Could not restore command history:", e)
    return {}
  }
}

const initialState: CommandState = restoredState()
const commandSlice = createSlice({
  name: VALKEY.COMMAND.name,
  initialState,
  reducers: {
    sendRequested: (state: CommandState, { payload: { connectionId } }) =>
      R.assocPath([connectionId, "pending"], true, state),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    sendFulfilled: (state: CommandState, action: PayloadAction<string, string, CmdMeta>) => {
      const { meta: { command, connectionId } } = action
      const cmd = withMetadata(command, action.payload, true)
      const prev = state[connectionId]?.commands ?? []

      return {
        ...state,
        [connectionId]: {
          pending: false,
          commands: [cmd, ...prev].slice(0, PERSISTED_COMMANDS_LIMIT),
        },
      }
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    sendFailed: (state: CommandState, action: PayloadAction<string, string, CmdMeta>) => {
      const { meta: { command, connectionId } } = action
      const cmd = withMetadata(command, action.payload, false)
      const prev = state[connectionId]?.commands ?? []

      return {
        ...state,
        [connectionId]: {
          pending: false,
          commands: [cmd, ...prev].slice(0, PERSISTED_COMMANDS_LIMIT),
        },
      }
    },
  },
  // needed to handle the case where a connection is deleted, so we can remove its command history from state
  extraReducers: (builder) => {
    builder.addCase(deleteConnection, (state, { payload: { connectionId, silent } }) =>
      silent ? state : R.dissoc(connectionId, state))
  },
})

export default commandSlice.reducer
export const { sendRequested, sendFulfilled, sendFailed } = commandSlice.actions
