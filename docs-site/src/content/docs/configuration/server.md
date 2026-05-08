---
title: Server
description: Configuration for the apps/server process
---

The `apps/server` process is the heart of Valkey Admin. It serves the built frontend, accepts WebSocket connections from the UI, exposes the `/orchestrator` REST router, and — depending on how it is configured — either spawns one metrics child per connection on demand, or runs a long-lived reconcile loop that discovers cluster nodes and tracks externally-managed metrics processes.

The server has no config file. Everything below is read from `process.env` at startup, in `apps/server/src/index.ts` and `apps/server/src/metrics-orchestrator.ts`.

## Picking a Mode

Before touching individual variables, decide which mode the server should run in. `DEPLOYMENT_MODE` is the key switch — it determines which other variables actually matter.

### Electron mode (desktop default)

When `DEPLOYMENT_MODE=Electron` (or unset in the desktop build), the server spawns a metrics child only for nodes the user has explicitly connected to. The UI initiates a connection, the server spawns a metrics child for that node, the child registers itself, and the server proxies its data back to the UI. When the UI disconnects, the child is killed.

In this mode the server does not need to know anything about Valkey up front — it learns connection details from the UI.

### Web mode (Docker default)

When `DEPLOYMENT_MODE=Web`, the server starts metrics processes for all cluster nodes as soon as any successful connection is made. Set `VALKEY_HOST` / `VALKEY_PORT` (plus any credential variables) to pre-configure the cluster connection on startup.

### Kubernetes mode

When `DEPLOYMENT_MODE=K8`, metrics processes are spawned **outside** the server (as pod sidecars) and call back to `POST /orchestrator/register` to advertise themselves. The server runs a reconcile loop that discovers cluster nodes via `VALKEY_HOST` / `VALKEY_PORT` and prunes stale registry entries older than `TTL` milliseconds.

## Network

### `PORT`

The TCP port the Express + WebSocket server listens on. The same port serves the static frontend, the WebSocket endpoint, and the `/orchestrator` REST routes.

- **Default:** `8080`
- **Read in:** `apps/server/src/index.ts`

```bash
PORT=9090
```

## Mode & Orchestrator

### `DEPLOYMENT_MODE`

Controls how the server manages metrics processes and which nodes get monitored. Accepted values:

- **`Electron`** — spawn metrics only for explicitly connected nodes (desktop default)
- **`Web`** — spawn metrics for all cluster nodes on any successful connection (Docker default)
- **`K8`** — expect externally-managed metrics sidecars that self-register via `/orchestrator/register`

- **Default:** `Electron` for the desktop build, `Web` for Docker
- **Read in:** `apps/server/src/metrics-orchestrator.ts`, `apps/server/src/websocket-origin.ts`

### `TTL`

How long (in milliseconds) a metrics server entry is allowed to live in the orchestrator registry without being seen again. Each successful `register` or `ping` from a metrics child resets the entry's `lastSeen`; the next reconcile pass after `TTL` elapses removes it.

- **Default:** `60000`
- **Read in:** `apps/server/src/metrics-orchestrator.ts`

### `TOPOLOGY_REFRESH_INTERVAL`

How long (in milliseconds) the server waits between cluster topology refresh cycles. Shorter values keep the node list more current at the cost of more frequent Valkey queries.

- **Default:** `30000`
- **Read in:** `apps/server/src/index.ts`

### `VALKEY_ADMIN_ALLOWED_WS_ORIGINS`

Comma-separated list of origins allowed to open a WebSocket connection to the server. Used in `Web` mode to restrict browser access to trusted origins. In `Electron` mode origin checking is skipped.

```bash
VALKEY_ADMIN_ALLOWED_WS_ORIGINS=https://valkey-admin.example.com,https://other.example.com
```

- **Default:** unset (no origin restriction in Electron mode; Web mode rejects connections with no matching origin when this is set)
- **Read in:** `apps/server/src/websocket-origin.ts`

## Initial Valkey Connection (Orchestrator Mode)

These variables populate `initialConnectionDetails`, which the orchestrator uses to talk to Valkey directly. They are also forwarded to spawned metrics children in default mode, so setting them at the server level can act as a shared default.

### `VALKEY_HOST`

Host of the initial Valkey node or cluster endpoint.

- **Default:** `""`

### `VALKEY_PORT`

Port of the initial Valkey node or cluster endpoint.

- **Default:** `""`

### `VALKEY_USERNAME`

Username for password or IAM authentication.

### `VALKEY_PASSWORD`

Password for password authentication. When unset, the server connects without credentials.

### `VALKEY_TLS`

Enable TLS for the Valkey connection. Compared as the literal string `"true"`.

- **Default:** `false`

### `VALKEY_VERIFY_CERT`

Verify the TLS server certificate. Compared as the literal string `"true"`. Leave this off only when you are knowingly talking to a node with a self-signed cert.

- **Default:** `false`

### `VALKEY_ENDPOINT_TYPE`

Tells the orchestrator how to interpret `VALKEY_HOST` / `VALKEY_PORT` when discovering cluster topology.

- **`"node"`** — the host/port refers to a single cluster node
- **anything else** — treated as `"cluster-endpoint"` (the default)

### `VALKEY_AUTH_TYPE`

Selects the credentials provider for the initial connection.

- **`"iam"`** — use AWS ElastiCache IAM authentication. Requires `VALKEY_USERNAME`, `VALKEY_AWS_REGION`, and `VALKEY_REPLICATION_GROUP_ID`.
- **anything else** — fall back to password authentication using `VALKEY_USERNAME` / `VALKEY_PASSWORD`.

- **Default:** `"password"`

### `VALKEY_AWS_REGION`

AWS region for ElastiCache IAM authentication. Only consulted when `VALKEY_AUTH_TYPE=iam`.

### `VALKEY_REPLICATION_GROUP_ID`

ElastiCache replication group / cluster name used as the IAM `clusterName`. Only consulted when `VALKEY_AUTH_TYPE=iam`.

## Defaults Forwarded to Metrics Children

When the server spawns a metrics child in default mode, it copies its own environment into the child and overrides a few values per node. The variables below are the ones a metrics child will inherit unchanged unless the server explicitly sets them — so configuring them on the server is a convenient way to apply the same setting to every spawned child.

### `SERVER_HOST`

The host that spawned children should call back to when registering with `/orchestrator/register`.

- **Default:** `localhost`

### `SERVER_PORT`

The port that spawned children should call back to when registering.

- **Default:** `8080`

### `DATA_DIR`

Base directory the server passes to each spawned child. Each child gets its own subdirectory at `${DATA_DIR}/${nodeId}` for its NDJSON output, so a single `DATA_DIR` is enough for an entire cluster.

- **Default:** `apps/server/data`, resolved relative to the compiled server entry point

## Behaviour & Limits

### `HOT_KEYS_COUNT`

Maximum number of hot keys returned per query. Applies to both monitor-based and slot-stats-based hot key detection.

- **Default:** `50`
- **Read in:** `apps/server/src/actions/hotkeys.ts`

### `COMMAND_LOGS_COUNT`

Maximum number of command log entries (slow logs, large requests, large replies) returned per query.

- **Default:** `100`
- **Read in:** `apps/server/src/actions/commandLogs.ts`

## Electron Packaging

This variable is set automatically when the server runs as part of the Electron desktop app. It tells the server where to find bundled assets that live outside the workspace `node_modules` layout. You generally do not need to touch it by hand.

### `PROCESS_RESOURCES_PATH`

Absolute path to the bundled Electron resources directory containing `server-metrics.js` and `config.yml`. When set, the server resolves the metrics entry point and `config.yml` from this path instead of the workspace layout.

- **Default:** `""`
- **Read in:** `apps/server/src/metrics-orchestrator.ts`
