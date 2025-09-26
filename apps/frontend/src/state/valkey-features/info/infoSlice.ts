import { createSlice } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants.ts"
import * as R from "ramda"

interface ConnectionData {
  total_commands_processed: number | null
  dataset_bytes: number | null
  connected_clients: number | null
  keys_count: number | null
  bytes_per_key: number | null
  server_name: string | null
  tcp_port: number | null
}

interface ConnectionState {
  error: string | null
  lastUpdated: number | null
  data: ConnectionData
}

interface InfoSliceState {
  [connectionId: string]: ConnectionState
}

const createInitialConnectionState = (): ConnectionState => ({
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
})

const initialState: InfoSliceState = {}

const infoSlice = createSlice({
  name: VALKEY.STATS.name,
  initialState,
  reducers: {
    setLastUpdated: (state, action) => {
      const { connectionId, timestamp } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createInitialConnectionState()
      }
      state[connectionId].lastUpdated = timestamp
    },
    setData: (state, action) => {
      const { connectionId } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createInitialConnectionState()
      }
      state[connectionId].data = R.applySpec({
        dataset_bytes: R.path(["memory", "dataset.bytes"]),
        keys_count: R.path(["memory", "keys.count"]),
        bytes_per_key: R.path(["memory", "keys.bytes-per-key"]),
        server_name: R.path(["info", "server_name"]),
        tcp_port: R.path(["info", "tcp_port"]),
        total_commands_processed: R.path(["info", "total_commands_processed"]),
        connected_clients: R.path(["info", "connected_clients"]),
      })(action.payload)
    },
    setError: (state, action) => {
      const { connectionId, error } = action.payload
      if (!state[connectionId]) {
        state[connectionId] = createInitialConnectionState()
      }
      state[connectionId].error = error
    },
  },
})

export default infoSlice.reducer
export const { setLastUpdated, setData, setError } = infoSlice.actions
