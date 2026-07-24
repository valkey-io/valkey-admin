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

interface ConnectionCommands {
  pending: boolean
  commands: CommandMetadata[]
}

export interface CommandState {
  // limit the number of commands stored per connection
  limit: number
  connections: {
    [id: string]: ConnectionCommands
  }
}

interface PersistedCommandState {
  limit?: number
  connections?: {
    [id: string]: { commands?: CommandMetadata[] } | undefined
  }
}

// limit must be at least 1
const clampLimit = (n: number): number =>
  Math.max(Math.round(n), 1)

const withMetadata = (command: string, response: JSONObject, isFulfilled = true): CommandMetadata => ({
  command,
  error: isFulfilled ? null : response,
  response: isFulfilled ? response : null,
  isFulfilled,
  timestamp: Date.now(),
})

const restoredState = (): CommandState => {
  const empty = (): CommandState => ({ limit: PERSISTED_COMMANDS_LIMIT, connections: {} })
  try {
    const saved = sessionStorage.getItem(SESSION_STORAGE.VALKEY_COMMANDS)
    if (saved === null) return empty()

    const parsed = JSON.parse(saved) as PersistedCommandState
    const limit = clampLimit(parsed.limit ?? PERSISTED_COMMANDS_LIMIT)

    return {
      limit,
      connections: R.map(
        (entry) => ({ pending: false, commands: (entry?.commands ?? []).slice(0, limit) }),
        parsed.connections ?? {},
      ),
    }
  } catch (e) {
    console.error("Could not restore command history:", e)
    return empty()
  }
}

const initialState: CommandState = restoredState()
const commandSlice = createSlice({
  name: VALKEY.COMMAND.name,
  initialState,
  reducers: {
    sendRequested: (state: CommandState, { payload: { connectionId } }) =>
      R.assocPath(["connections", connectionId, "pending"], true, state),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    sendFulfilled: (state: CommandState, action: PayloadAction<string, string, CmdMeta>) => {
      const { meta: { command, connectionId } } = action
      const cmd = withMetadata(command, action.payload, true)
      const prev = state.connections[connectionId]?.commands ?? []
      return {
        ...state,
        connections: {
          ...state.connections,
          [connectionId]: {
            pending: false,
            commands: [cmd, ...prev],
          },
        },
      }
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    sendFailed: (state: CommandState, action: PayloadAction<string, string, CmdMeta>) => {
      const { meta: { command, connectionId } } = action
      const cmd = withMetadata(command, action.payload, false)
      const prev = state.connections[connectionId]?.commands ?? []

      return {
        ...state,
        connections: {
          ...state.connections,
          [connectionId]: {
            pending: false,
            commands: [cmd, ...prev],
          },
        },
      }
    },
    setCommandHistoryLimit: (state: CommandState, { payload }: PayloadAction<number>) => ({
      ...state,
      limit: clampLimit(payload),
    }),
  },
  extraReducers: (builder) => {
    builder.addCase(deleteConnection, (state, { payload: { connectionId, silent } }) =>
      silent ? state : R.dissocPath(["connections", connectionId], state))
  },
})

export default commandSlice.reducer
export const { sendRequested, sendFulfilled, sendFailed, setCommandHistoryLimit } = commandSlice.actions
