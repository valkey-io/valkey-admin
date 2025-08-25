import { createSlice } from "@reduxjs/toolkit";
import {VALKEY} from "@common/src/constants.ts"

const infoSlice = createSlice({
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
            server_name: null,
            tcp_port: null,
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
            state.data.server_name = action.payload.info['server_name'];
            state.data.tcp_port = action.payload.info['tcp_port'];
        },
        setError: (state, action) => {
            state.error = action.payload
        }
    }
})

export default infoSlice.reducer
export const { setLastUpdated, setData, setError } = infoSlice.actions