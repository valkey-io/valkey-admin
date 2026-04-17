export const accordionDescriptions = {
  memoryUsageMetrics:
        "Detailed metrics for tracking Valkey's memory usage across data, scripts, functions, and peak consumption.",
  uptimeMetrics:
        "Tracks server uptime and script eviction to monitor overall system activity and availability.",
  replicationPersistenceMetrics:
        "Metrics that track database snapshots, data changes, and replication backlog health to ensure reliable syncing and persistence.",
  clientConnectivityMetrics:
        "Metrics tracking client connections, activity, and connection limits to monitor workload and health.",
  commandExecutionMetrics:
        "Metrics showing command volume, failures, slow operations, and errors to evaluate performance and stability.",
  dataEffectivenessEvictionMetrics:
        "Tracks key activity, expirations, evictions, and cache hit-rates to assess data efficiency and access performance.",
  messagingMetrics: "Tracks Pub/Sub channels, patterns, and clients to measure real-time activity.",
}

export const singleMetricDescriptions = {
  // for memory usage
  used_memory: {
    description: "Total number of bytes allocated by Valkey using its allocator.",
    unit: "Unit: Bytes",
  },
  used_memory_dataset: {
    description: "The size in bytes of the dataset.",
    unit: "Unit: Bytes",
  },
  used_memory_functions: {
    description: "Number of bytes overhead by Function scripts (part of used_memory).",
    unit: "Unit: Bytes",
  },
  used_memory_vm_eval: {
    description: "Number of bytes used by the script VM engines for EVAL framework (not part of used_memory).",
    unit: "Unit: Bytes",
  },
  used_memory_peak: {
    description: "Peak memory consumed by Valkey.",
    unit: "Unit: Bytes",
  },
  used_memory_scripts: {
    description: "Number of bytes overhead by the EVAL scripts + Number of bytes overhead by Function scripts (part of used_memory).",
    unit: "Unit: Bytes",
  },
  max_memory: {
    description: "Maximum amount of memory allocated for the Valkey instance.",
    unit: "Unit: Bytes",
  },
  total_system_memory: {
    description: "Total amount of memory that the Valkey instance has available.",
    unit: "Unit: Bytes",
  },

  // uptime metrics
  evicted_scripts: {
    description: "Number of evicted EVAL scripts due to LRU policy.",
    unit: "",
  },
  uptime_in_seconds: {
    description: "Number of seconds since Valkey server start.",
    unit: "Unit: Seconds",
  },
  total_net_input_bytes: {
    description: "The total number of bytes read from the network.",
    unit: "Unit: Bytes",
  },
  total_net_output_bytes: {
    description: "The total number of bytes written to the network.",
    unit: "Unit: Bytes",
  },

  // replication and persistence metrics
  rdb_bgsave_in_progress: {
    description: "Flag indicating a RDB save is on-going, including a diskless replication RDB save.",
    unit: "",
  },
  rdb_changes_since_last_save: {
    description: "Number of changes since the last RDB file save.",
    unit: "",
  },
  rdb_saves: {
    description: "Number of RDB snapshots performed since startup.",
    unit: "",
  },
  mem_replication_backlog: {
    description: "Memory used by replication backlog.",
    unit: "",
  },
  sync_full: {
    description: "The number of full resyncs with replicas.",
    unit: "",
  },
  repl_backlog_active: {
    description: "Flag indicating replication backlog is active.",
    unit: "",
  },

  // client connectivity metrics
  blocked_clients: {
    description: "Number of clients pending on a blocking call.",
    unit: "",
  },
  clients_in_timeout_table: {
    description: "Number of clients in the clients timeout table.",
    unit: "",
  },
  connected_clients: {
    description: "Number of client connections (excluding connections from replicas).",
    unit: "",
  },
  connected_slaves: {
    description: "Number of connected replicas.",
    unit: "",
  },
  total_connections_received: {
    description: "Total number of connections accepted by the server.",
    unit: "",
  },
  evicted_clients: {
    description: "Number of evicted clients due to maxmemory-clients limit.",
    unit: "",
  },
  rejected_connections: {
    description: "Number of connections rejected because of maxclients limit.",
    unit: "",
  },
  total_reads_processed: {
    description: "Total number of read events processed.",
    unit: "",
  },
  total_writes_processed: {
    description: "Total number of write events processed.",
    unit: "",
  },
  tracking_clients: {
    description: "Number of clients being tracked.",
    unit: "",
  },
  watching_clients: {
    description: "Number of clients in watching mode.",
    unit: "",
  },

  // command execution metrics
  total_commands_processed: {
    description: "Total number of commands processed by server.",
    unit: "",
  },
  total_blocking_keys: {
    description: "Number of blocking keys.",
    unit: "",
  },
  total_error_replies: {
    description: "Total number of issued error replies, that is the sum of rejected commands and failed commands.",
    unit: "",
  },
  total_watched_keys: {
    description: "Number of watched keys.",
    unit: "",
  },
  unexpected_error_replies: {
    description: "Number of unexpected error replies, that are types of errors from an AOF load or replication.",
    unit: "",
  },

  // data effectiveness and eviction metrics
  evicted_keys: {
    description: "Number of evicted keys due to maxmemory limit.",
    unit: "",
  },
  expired_keys: {
    description: "Total number of key expiration events.",
    unit: "",
  },
  expired_stale_perc: {
    description: "The percentage of keys probably expired.",
    unit: "",
  },
  keyspace_hits: {
    description: "Number of successful lookup of keys in the main dictionary.",
    unit: "",
  },
  keyspace_misses: {
    description: "Number of failed lookup of keys in the main dictionary.",
    unit: "",
  },
  number_of_cached_scripts: {
    description: "The number of EVAL scripts cached by the server.",
    unit: "",
  },
  number_of_functions: {
    description: "The number of functions.",
    unit: "",
  },

  // messaging metrics
  pubsubshard_channels: {
    description: "Global number of pub/sub shard channels with client subscriptions.",
    unit: "",
  },
  pubsub_channels: {
    description: "Global number of pub/sub channels with client subscriptions.",
    unit: "",
  },
  pubsub_clients: {
    description: "Number of clients in pubsub mode.",
    unit: "",
  },
  pubsub_patterns: {
    description: "Global number of pub/sub pattern with client subscriptions.",
    unit: "",
  },
}
