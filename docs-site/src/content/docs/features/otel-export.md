---
title: OpenTelemetry Export
description: Send Valkey memory, keyspace and CPU metrics to Prometheus and other backends over OTLP
---

Valkey Admin can push the metrics that its collectors gather to an [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/) over OTLP. From the Collector, the metrics go to Prometheus and to any other backend that you configure. You do not need a second exporter next to Valkey Admin.

Export is off by default. Each metrics collector exports the metrics of its own Valkey node.

## How It Works

```
Valkey node ── INFO every poll_ms ──► metrics collector ── OTLP/HTTP ──► OTel Collector ──► Prometheus (:8889)
                                       (one per node)                                   └──► other backends
```

- The collector already polls `INFO MEMORY`, `INFO KEYSPACE` and `INFO CPU` every `poll_ms` (5 s by default). Export uses the same replies, so it sends no extra command to Valkey.
- The collector pushes to the Collector. Export opens no new port on the collector.
- The export interval is the `poll_ms` of the `memory` epic. If there is no `memory` epic, it is the `poll_ms` of the `cpu` epic. If there is neither, export does not start, and the collector logs a warning.
- You run and configure the OTel Collector. To send the metrics to a new backend, edit the Collector config. Valkey Admin does not change.

## Setup

### 1. Run an OTel Collector

The repository has a Collector config for Valkey Admin: [`examples/otel/otel-collector-config.yaml`](https://github.com/valkey-io/valkey-admin/blob/main/examples/otel/otel-collector-config.yaml). It receives OTLP on ports 4317 (gRPC) and 4318 (HTTP), and exposes Prometheus metrics on port 8889.

```sh
docker run --rm -p 4318:4318 -p 8889:8889 \
  -v "$PWD/examples/otel/otel-collector-config.yaml:/etc/otelcol-contrib/config.yaml:ro" \
  otel/opentelemetry-collector-contrib:0.137.0
```

Point Prometheus at `http://<collector-host>:8889/metrics`.

### 2. Turn on export

Set these variables where the collectors run:

```sh
METRICS_OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://<collector-host>:4318
# Optional: group the series of one deployment
OTEL_RESOURCE_ATTRIBUTES=service.namespace=prod-cache
```

| Mode | Where to set the variables |
|------|----------------------------|
| Docker / Web | On the Valkey Admin server container. The server passes its environment to every collector that it starts. |
| Desktop | In the environment that launches the app. See [Desktop deployment](/deployment/desktop/#opentelemetry-export). |
| Kubernetes | On the metrics sidecar container. See [Kubernetes deployment](/deployment/kubernetes/#opentelemetry-export). |

To turn export off again without removing these variables, set `OTEL_SDK_DISABLED=true`.

See [Metrics configuration](/configuration/metrics/#opentelemetry-export) for all the variables.

## Exported Metrics

All values are the raw `INFO` fields. Compute ratios and rates in the backend. In Prometheus, the names get unit suffixes: `By` adds `_bytes`, `s` adds `_seconds`, `1` adds `_ratio`, and a Counter adds `_total`. For example, `valkey.memory.used` is `valkey_memory_used_bytes` and `valkey.cpu.time` is `valkey_cpu_time_seconds_total`.

### Memory

| Name | Instrument | Unit | `INFO` field |
|------|------------|------|--------------|
| `valkey.memory.used` | UpDownCounter | `By` | `used_memory` |
| `valkey.memory.used.overhead` | UpDownCounter | `By` | `used_memory_overhead` |
| `valkey.memory.used.dataset` | UpDownCounter | `By` | `used_memory_dataset` |
| `valkey.memory.used.peak` | Gauge | `By` | `used_memory_peak` |
| `valkey.memory.used.rss` | UpDownCounter | `By` | `used_memory_rss` |
| `valkey.memory.used.startup` | UpDownCounter | `By` | `used_memory_startup` |
| `valkey.memory.max` | UpDownCounter | `By` | `maxmemory`. Not exported when `maxmemory` is 0 (no limit). |
| `valkey.memory.fragmentation_ratio` | Gauge | `1` | `mem_fragmentation_ratio` |
| `valkey.memory.fragmentation_bytes` | UpDownCounter | `By` | `mem_fragmentation_bytes` |
| `valkey.memory.allocator_allocated` | UpDownCounter | `By` | `allocator_allocated` |
| `valkey.memory.allocator_active` | UpDownCounter | `By` | `allocator_active` |
| `valkey.memory.allocator_resident` | UpDownCounter | `By` | `allocator_resident` |
| `valkey.memory.allocator_frag_bytes` | UpDownCounter | `By` | `allocator_frag_bytes` |
| `valkey.memory.not_counted_for_evict` | UpDownCounter | `By` | `mem_not_counted_for_evict` |
| `valkey.memory.clients_normal` | UpDownCounter | `By` | `mem_clients_normal` |
| `valkey.memory.replication_backlog` | UpDownCounter | `By` | `mem_replication_backlog` |
| `valkey.memory.total_replication_buffers` | UpDownCounter | `By` | `mem_total_replication_buffers` |
| `valkey.memory.used.vm_eval` | UpDownCounter | `By` | `used_memory_vm_eval` |
| `valkey.memory.used.vm_functions` | UpDownCounter | `By` | `used_memory_vm_functions` |
| `valkey.memory.lazyfree_pending_objects` | UpDownCounter | `{object}` | `lazyfree_pending_objects` |

`used`, `used.overhead`, `used.dataset`, `max`, `fragmentation_ratio` and `fragmentation_bytes` use the ElastiCache metric names, so the same dashboards work on ElastiCache and on self-managed Valkey. `used.peak` is the high-water mark since the server started. A restart resets it, and `CONFIG RESETSTAT` does not.

A field that the server does not report, for example on an older Valkey version, is not exported.

### Keyspace

| Name | Instrument | Unit | `INFO KEYSPACE` value |
|------|------------|------|-----------------------|
| `valkey.db.keys` | UpDownCounter | `{key}` | `keys=` in each `db<N>` row |
| `valkey.db.expires` | UpDownCounter | `{key}` | `expires=` in each `db<N>` row |

Each point has the attribute `valkey.db.index`, the database index as a string (`"0"`, `"1"`, …). `INFO KEYSPACE` has a row only for a database that holds keys. A database that held keys and is now empty reports 0.

### CPU

| Name | Instrument | Unit | `INFO` fields | Scope |
|------|------------|------|---------------|-------|
| `valkey.cpu.time` | Counter | `s` | `used_cpu_user`, `used_cpu_sys` | Every thread of the server process |
| `valkey.cpu.main_thread.time` | Counter | `s` | `used_cpu_user_main_thread`, `used_cpu_sys_main_thread` | The main thread only |
| `valkey.cpu.children.time` | Counter | `s` | `used_cpu_user_children`, `used_cpu_sys_children` | Forked children (for example `BGSAVE`), after they exit |

Each point has the attribute `cpu.mode`, `user` or `system`. The three scopes overlap, because the main thread is one of the process's threads. So each scope is its own metric, and a sum over one metric is correct.

- `rate(valkey_cpu_main_thread_time_seconds_total[1m])` near 1 means that the main thread is saturated. This is the closest match to the ElastiCache `EngineCPUUtilization` metric. Servers on an OS without per-thread CPU accounting, such as macOS, do not report it.
- `valkey.cpu.time` also counts the I/O threads and the background threads.
- `valkey.cpu.children.time` grows only when a fork exits, so a `BGSAVE` shows as one step.

### Not exported

- Command logs, `MONITOR` output, hot keys and big keys. Key names as labels would make the series count unbounded.
- Values that the backend can compute from exported ones, such as `used_memory_dataset_perc` or `allocator_rss_ratio`.
- Text fields (`maxmemory_policy`, `mem_allocator`), the deprecated `used_memory_lua`, and version-specific fields such as `used_active_time_*` and `mem_replicas_repl_buffer`.
- Clients and stats counters (connected clients, keyspace hits and misses, commands processed). They are not in the polled replies.

## Resource Attributes

Each collector identifies its Valkey node with these resource attributes:

| Attribute | Value |
|-----------|-------|
| `service.name` | `valkey` |
| `service.instance.id` | The node id, `<host>-<port>` with every character other than letters, digits, `_` and `-` changed to `-` (for example `10-0-0-1-6379`) |
| `db.system.name` | `valkey` |
| `server.address` | The node host |
| `server.port` | The node port |
| `k8s.pod.name`, `k8s.namespace.name` | From the `POD_NAME` and `POD_NAMESPACE` environment variables, when they are set |

In Prometheus, `service.instance.id` becomes the `instance` label, `service.namespace/service.name` becomes the `job` label, and the other attributes are on the `target_info` series.

The collector does not set `service.namespace`. To set it, or to add other attributes, use `OTEL_RESOURCE_ATTRIBUTES`. That variable cannot change `service.name` or `service.instance.id`.

## Series Count

The number of series for a deployment is:

**N × (26 + 2D)**

- **N** is the number of exported nodes.
- **D** is the number of databases per node that held keys since the collector started.
- Subtract 1 per node when `maxmemory` is 0. Subtract 2 per node when the server has no main-thread CPU fields.

With the default configuration, a standalone node exports at most 58 series (16 databases), and a cluster node exports 28.

## Limitations

- **A fetch outage shows as a flat line, not a gap.** When the collector cannot reach Valkey, it keeps exporting the last values it fetched. The OpenTelemetry JavaScript SDK keeps exporting a value that a callback no longer reports ([opentelemetry-js#4096](https://github.com/open-telemetry/opentelemetry-js/issues/4096)). An alert on missing data does not fire during a fetch outage.
- **Replicas are exported only in Kubernetes.** In Docker, Web and Desktop mode, Valkey Admin starts collectors for primary nodes only.
- **Desktop exports only the connected node.** The desktop (Electron) app does not start collectors for the other nodes of a cluster.
- **No cluster id.** The collector does not set `service.namespace`. In Web mode, one server can watch more than one cluster, and every collector inherits the same `OTEL_RESOURCE_ATTRIBUTES`. So all clusters get the same `job` label, and you cannot group the series by cluster. Each node still has its own `instance` label. A later version will run one collector per cluster and set the cluster id.
- **Connections of UI users export too.** In Web mode, every collector inherits `METRICS_OTEL_ENABLED` from the server. This includes the collectors for nodes that users connect to in the UI, not only the preconfigured connection.
- **Duplicate series.** When two Valkey users connect to the same node, Valkey Admin runs one collector for each, and both export the same series. Their samples interleave, so a counter can step back, and `rate()` shows a false spike. To prevent this, connect each node with one Valkey user. A later version will run one collector per cluster.
- **A stale `valkey.memory.max`.** If `maxmemory` changes from a limit to 0 at runtime, the last limit keeps being exported until the collector restarts.
- **Stopped collectors.** When a collector stops (its node left the cluster, or Valkey Admin stopped), its series stay on the Collector's Prometheus endpoint until `metric_expiration`. The example config sets 1 minute.
- **Gaps when `poll_ms` is 1 minute or more.** A collector pushes once per `poll_ms`. If `poll_ms` is equal to or longer than `metric_expiration`, the Collector drops the series between two pushes, so they show gaps. With the example config (1 minute) and `poll_ms` 70000, each series was missing for the first 70 s and then for about 5 s of every 70 s. Set `metric_expiration` longer than the largest `poll_ms` of the `memory` and `cpu` epics. A longer value also keeps the series of a stopped collector visible for longer.
- **Pod names in Web mode.** If the Valkey Admin server runs in a Kubernetes pod with `POD_NAME` and `POD_NAMESPACE` set, every collector it starts reports the server's pod, not the Valkey pod.
- **Kubernetes is not tested end to end.** The sidecar uses the same collector code, but the Kubernetes export path has no automated end-to-end test in this release.
- **Fixed protocol and interval.** The collector always uses OTLP over HTTP with protobuf, so `OTEL_EXPORTER_OTLP_PROTOCOL` has no effect. The interval comes from `poll_ms`, so `OTEL_METRIC_EXPORT_INTERVAL` and `OTEL_METRIC_EXPORT_TIMEOUT` have no effect.
