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
  total_system_memory: number | null
  used_memory: number | null
  used_memory_dataset : number | null
  used_memory_functions : number | null
  used_memory_vm_eval : number | null
  used_memory_peak : number | null
  used_memory_scripts : number | null
  uptime_in_seconds : number | null
  total_net_output_bytes : number | null
  total_net_input_bytes : number | null
  evicted_scripts : number | null
  rdb_bgsave_in_progress : number | null
  rdb_changes_since_last_save : number | null
  rdb_saves : number | null
  mem_replication_backlog : number | null
  sync_full : number | null
  repl_backlog_active : number | null
  blocked_clients : number | null
  clients_in_timeout_table : number | null
  connected_slaves : number | null
  total_connections_received : number | null
  evicted_clients : number | null
  rejected_connections : number | null
  total_reads_processed : number | null
  total_writes_processed : number | null
  tracking_clients : number | null
  watching_clients : number | null
  total_blocking_keys : number | null
  total_error_replies : number | null
  total_watched_keys : number | null
  unexpected_error_replies : number | null
  evicted_keys : number | null
  expired_keys : number | null
  expired_stale_perc : number | null
  keyspace_hits : number | null
  keyspace_misses : number | null
  number_of_cached_scripts : number | null
  number_of_functions : number | null
  pubsubshard_channels : number | null
  pubsub_channels : number | null
  pubsub_clients : number | null
  pubsub_patterns : number | null
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
    total_system_memory: null,
    used_memory: null,
    used_memory_dataset : null,
    used_memory_functions : null,
    used_memory_vm_eval : null,
    used_memory_peak : null,
    used_memory_scripts : null,
    uptime_in_seconds : null,
    total_net_output_bytes : null,
    total_net_input_bytes : null,
    evicted_scripts : null,
    rdb_bgsave_in_progress : null,
    rdb_changes_since_last_save : null,
    rdb_saves : null,
    mem_replication_backlog : null,
    sync_full : null,
    repl_backlog_active : null,
    blocked_clients : null,
    clients_in_timeout_table : null,
    connected_slaves : null,
    total_connections_received : null,
    evicted_clients : null,
    rejected_connections : null,
    total_reads_processed : null,
    total_writes_processed : null,
    tracking_clients : null,
    watching_clients : null,
    total_blocking_keys : null,
    total_error_replies : null,
    total_watched_keys : null,
    unexpected_error_replies : null,
    evicted_keys : null,
    expired_keys : null,
    expired_stale_perc : null,
    keyspace_hits : null,
    keyspace_misses : null,
    number_of_cached_scripts : null,
    number_of_functions : null,
    pubsubshard_channels : null,
    pubsub_channels : null,
    pubsub_clients : null,
    pubsub_patterns : null,
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
        total_system_memory: R.path(["info", "total_system_memory"]),
        used_memory: R.path(["info", "used_memory"]),
        used_memory_dataset : R.path(["info", "used_memory_dataset"]),
        used_memory_functions : R.path(["info", "used_memory_functions"]),
        used_memory_vm_eval : R.path(["info", "used_memory_vm_eval"]),
        used_memory_peak : R.path(["info", "used_memory_peak"]),
        used_memory_scripts : R.path(["info", "used_memory_scripts"]),
        uptime_in_seconds : R.path(["info", "uptime_in_seconds"]),
        total_net_output_bytes : R.path(["info", "total_net_output_bytes"]),
        total_net_input_bytes : R.path(["info", "total_net_input_bytes"]),
        evicted_scripts : R.path(["info", "evicted_scripts"]),
        rdb_bgsave_in_progress : R.path(["info", "rdb_bgsave_in_progress"]),
        rdb_changes_since_last_save : R.path(["info", "rdb_changes_since_last_save"]),
        rdb_saves : R.path(["info", "rdb_saves"]),
        mem_replication_backlog : R.path(["info", "mem_replication_backlog"]),
        sync_full : R.path(["info", "sync_full"]),
        repl_backlog_active : R.path(["info", "repl_backlog_active"]),
        blocked_clients : R.path(["info", "blocked_clients"]),
        clients_in_timeout_table : R.path(["info", "clients_in_timeout_table"]),
        connected_slaves : R.path(["info", "connected_slaves"]),
        total_connections_received : R.path(["info", "total_connections_received"]),
        evicted_clients : R.path(["info", "evicted_clients"]),
        rejected_connections : R.path(["info", "rejected_connections"]),
        total_reads_processed : R.path(["info", "total_reads_processed"]),
        total_writes_processed : R.path(["info", "total_writes_processed"]),
        tracking_clients : R.path(["info", "tracking_clients"]),
        watching_clients : R.path(["info", "watching_clients"]),
        total_blocking_keys : R.path(["info", "total_blocking_keys"]),
        total_error_replies : R.path(["info", "total_error_replies"]),
        total_watched_keys : R.path(["info", "total_watched_keys"]),
        unexpected_error_replies : R.path(["info", "unexpected_error_replies"]),
        evicted_keys : R.path(["info", "evicted_keys"]),
        expired_keys : R.path(["info", "expired_keys"]),
        expired_stale_perc : R.path(["info", "expired_stale_perc"]),
        keyspace_hits : R.path(["info", "keyspace_hits"]),
        keyspace_misses : R.path(["info", "keyspace_misses"]),
        number_of_cached_scripts : R.path(["info", "number_of_cached_scripts"]),
        number_of_functions : R.path(["info", "number_of_functions"]),
        pubsubshard_channels : R.path(["info", "pubsubshard_channels"]),
        pubsub_channels : R.path(["info", "pubsub_channels"]),
        pubsub_clients : R.path(["info", "pubsub_clients"]),
        pubsub_patterns : R.path(["info", "pubsub_patterns"]),
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
