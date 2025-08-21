import { createSlice } from "@reduxjs/toolkit";
import {VALKEY} from "@common/src/constants.ts"

const valkeyInfoSlice = createSlice({
    name: VALKEY.STATS.name,
    initialState: {
        error: null,
        lastUpdated: null,
        data: {
            total_commands_processed: null,
            dataset_bytes: null,
            connected_clients: null,
            keys_count: null,
            bytes_per_key: null,
        },
    },
    reducers: {
        setLastUpdated: (state, action) => {
            state.lastUpdated = action.payload
        },
        setData: (state, action) => {
            console.log("This is the payload", action.payload)
            state.data.total_commands_processed = action.payload.info["total_commands_processed"]
            state.data.connected_clients = action.payload.info['connected_clients'];
            state.data.dataset_bytes = action.payload.memory['dataset.bytes']
            state.data.keys_count = action.payload.memory['keys.count']
            state.data.bytes_per_key = action.payload.memory['keys.bytes-per-key'];
        },
        setError: (state, action) => {
            state.error = action.payload
        }
    }
})

export default valkeyInfoSlice.reducer
export const { setLastUpdated, setData, setError } = valkeyInfoSlice.actions