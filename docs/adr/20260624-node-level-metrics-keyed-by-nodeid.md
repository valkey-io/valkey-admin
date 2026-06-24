# ADR — Node-level metrics state keyed by db-less `nodeId`, not the db-suffixed `connectionId`

- **Status:** Accepted
- **Date:** 2026-06-24
- **Related:** Builds on the `cluster-monitor-config-id-mismatch` bugfix, which made cluster monitor/config state surface correctly. This ADR records the id-space decision that fix implied and extends it to standalone monitor, config, hot keys, and command logs.

## Context

Valkey Admin uses three distinct id-spaces that must not be conflated:

- **`connectionId`** — `<host>-<port>-db<N>`, db-suffixed. It is the key of the server `clients` map, the frontend route param `id`, and the identity of a user-visible connection. Each `(host, port, db)` triple is a separate connection with its own Glide client.
- **`nodeId`** — `<host>-<port>`, db-less. The identity of a Valkey node. A metrics process is **one OS process per node**, and the data it samples (MONITOR, COMMANDLOG, MEMORY/INFO stats) and its sampler config are server-global per node, not db-scoped. Many db connections map to one node (N:1).
- **`clusterId`** — the cluster's own id from `CLUSTER SLOTS`; db-less.

One further name, **`targetId`**, appears in the frontend but is *not* a fourth id-space: it is the deliberately polymorphic key variable used in the metrics slices and `ActivityView`, resolved as `clusterId ?? nodeId`. It holds whichever of the two db-less id-spaces applies (cluster aggregate vs. per-node/standalone) and is the one place a name intentionally spans id-spaces; every other field is named for its exact id-space.

Node-level metrics state (monitor status, sampler config, hot keys, command logs) was keyed by the db-suffixed `connectionId` on the standalone path, while the server emitted some replies in the db-less node id-space. Producer and consumer disagreed on the id-space: state was written under keys the UI never read. The visible symptoms were monitor status that never surfaced, config updates that didn't appear, a pending monitor stuck loading, duplicate hot-key responses, and standalone hot keys showing no result.

The ambiguity was **invisible at the call sites.** A single reply field (`connectionId`) sometimes carried a `clusterId`, and the same `<host>-<port>-db<N>` string was used both as a connection key and, after an ad-hoc `toMetricsNodeId` strip, as a metrics key. A reader could not tell from a reducer or an action which id-space a value belonged to, so "two connections to the same node on different databases" silently produced two independent monitor/config entries for what is physically one sampler.

## Decision

All node-level metrics state is keyed by the db-less **`nodeId`**, with cluster aggregates keyed by **`clusterId`**. No metrics reply or metrics state is keyed by the db-suffixed `connectionId`.

Concretely:

- **Explicit reply id-spaces** (`common/src/reply-id.ts`). Every metrics reply identifies itself with exactly one id-space — no field holds more than one:
  - `AggregateReplyId = { clusterId } | { nodeId }` — stored as one entry per cluster (aggregated) or per standalone node. Used by config, hot keys, command logs.
  - `NodeReplyId = { clusterId, nodeId } | { nodeId }` — stored per node. Used by monitor.

  No reply carries a `{ connectionId }` arm.

- **One shared, idempotent db-strip** (`toNodeId` in `common/src/connection-id.ts`, exported from `valkey-common`). It strips only a trailing `-db<digits>` group (`id.replace(/-db\d+$/, "")`), is total and idempotent, and replaces the server's duplicated `toMetricsNodeId` regex at every call site (`metrics-orchestrator`, `connection`, and the `config`/`cpuUsage`/`memoryUsage`/`hotkeys`/`commandLogs`/`monitorAction`/`stats` actions).

- **Explicit cluster vs. standalone branches.** Server actions and frontend reducers split into explicit branches rather than overloading one `targetId`/`connectionId` value. Standalone emits `{ nodeId }`; cluster emits `{ clusterId }` (aggregated) or `{ clusterId, nodeId }` (per-node monitor). Frontend consumers resolve their key as `clusterId ?? toNodeId(id)`.

Rationale:

- **The data is node-level, so the key must be.** One MONITOR sampler runs per node; its data and config have no database dimension. Keying by `connectionId` modeled a database dimension that does not exist, splitting one physical sampler into multiple entries.
- **Naming for the id-space prevents the class of bug.** When every field, variable, and parameter is named `clusterId`, `nodeId`, or `connectionId` and holds exactly that, producer and consumer cannot silently disagree. The original defect was a single field that sometimes held a `clusterId`.
- **`connectionId` is still correct where identity is db-scoped.** The `clients` map, route params, connection state, and watcher subscriptions legitimately remain db-suffixed. Only metrics reply/state keying moves to `nodeId`.

## Consequences

- Two connections to the same node on different databases now share a single monitor/config/hot-keys/command-logs entry, matching the one-sampler-per-node reality.
- `nodeId` derivation is centralized: the server no longer reimplements the strip, and the frontend uses the same `toNodeId`. The `connection-id-ownership` guard is unaffected (it targets `sanitizeUrl(host-port)` construction, not strips).
- Connection-scoped state remains keyed by the db-suffixed `connectionId` and coexists with the node-level state in the same view. In `ActivityView`, the route supplies `id` (`connectionId`) and `clusterId`; the component derives `nodeId = toNodeId(id)` and `targetId = clusterId ?? nodeId` once, then routes each selector to the id-space its data actually lives in: hot keys, command logs, monitor, and sampler config read by `targetId`, while `connectionDetails`, `clusterAlias`, and the key browser read by `id`. The two ids are not redundant copies of one record as they address different state.
- Tests assert the id-space directly: standalone replies carry `{ nodeId }`, cluster replies carry `{ clusterId }` (or `{ clusterId, nodeId }` for monitor), `nodeErrors[].nodeId` stays db-less, and a db-suffixed input is stripped in the emitted id. `toNodeId` has unit coverage for idempotence and trailing-only stripping.
- Cluster aggregation, the per-node granularity of `MonitorWarningBanner`, and the standalone watcher broadcast are behavior-preserving; only the key changes.

## Out of scope

- **Watcher subscription keying.** `node-watchers` subscribe by the db-suffixed `connectionId`, and `getOtherWatchers` is still called with the `connectionId` on the standalone monitor path. Unchanged.
- **Connection state, route params, and the `clients` map.** These are genuinely db-scoped and remain keyed by `connectionId`.
- **Per-row `nodeId` inside aggregated hot-keys/command-logs data.** Already db-less; unchanged.
