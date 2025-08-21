import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import {VALKEY} from "@common/src/constants.ts"

type CmdMeta = { command: string }

interface CommandMetadata {
    command: string
    error: string | null
    response: string | null
    isFulfilled: boolean
    timestamp: number
}

interface CommandState {
    pending: boolean
    error: string | null
    commands: CommandMetadata[]
}

const initialState: CommandState = {
    pending: false,
    error: null,
    commands: [],
}

const withMetadata = (
    command: string,
    response: string,
    isFulfilled = true
): CommandMetadata => ({
    command,
    error: isFulfilled ? null : response,
    response: isFulfilled ? response : null,
    isFulfilled,
    timestamp: Date.now(),
})

const valkeyCommandSlice = createSlice({
    name: VALKEY.COMMAND.name,
    initialState,
    reducers: {
        sendPending: (state) => {
            state.pending = true
        },
        sendFulfilled: (state, action: PayloadAction<string, string, CmdMeta>) => {
            state.pending = false
            state.commands.push(withMetadata(action.meta.command, action.payload, true))
        },
        sendFailed: (state, action: PayloadAction<string, string, CmdMeta>) => {
            state.pending = false
            state.commands.push(withMetadata(action.meta.command, action.payload, false))
        }
    }
})

export default valkeyCommandSlice.reducer
export const { sendFulfilled, sendPending, sendFailed } = valkeyCommandSlice.actions