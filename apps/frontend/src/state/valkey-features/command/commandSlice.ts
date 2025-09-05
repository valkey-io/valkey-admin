import * as R from "ramda"
import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants.ts"

type CmdMeta = { command: string, connectionId: string }

export interface CommandMetadata {
  command: string
  error: string | null
  response: string | null
  isFulfilled: boolean
  timestamp: number
}

interface CommandState {
  [id: string]: {
    pending: boolean
    commands: CommandMetadata[]
  }
}

const withMetadata = (command: string, response: string, isFulfilled = true): CommandMetadata => ({
  command,
  error: isFulfilled ? null : response,
  response: isFulfilled ? response : null,
  isFulfilled,
  timestamp: Date.now(),
})

const initialState: CommandState = {}
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
          commands: [cmd, ...prev],
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
          commands: [cmd, ...prev],
        },
      }
    },
  },
})

export default commandSlice.reducer
export const { sendRequested, sendFulfilled, sendFailed } = commandSlice.actions
