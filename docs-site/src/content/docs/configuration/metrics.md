---
title: Metrics
description: Configuration for the apps/metrics process
---

The `apps/metrics` process is a small Node.js sampler. Each instance is responsible for exactly one Valkey node (or one cluster, when run standalone): it opens a connection, runs the collectors defined in its config, writes NDJSON output to disk, exposes an HTTP API the server consumes, and registers itself with the Valkey Admin server's `/orchestrator/register` endpoint at startup. Registration is authenticated, see [`ORCHESTRATOR_KEY`](#orchestrator_key).

The metrics process is unusual in that it has **two** sources of configuration that layer on top of each other:

1. **`config.yml`** — the canonical source for collector definitions, retention rules, server defaults, and logging defaults.
2. **Environment variables** — used to inject per-instance details (which Valkey to talk to, where to register) and to override a handful of YAML fields at load time.

The sections below walk through both sources in the order they get applied.

## The `config.yml` File

When the metrics process starts it loads `apps/metrics/config.yml` (or the file at `CONFIG_PATH` if set), parses it with YAML, and merges it on top of these defaults:

```yaml
backend:
  ping_interval: 10000
server:
  port: 0
  data_dir: /app/data
collector:
  batch_ms: 60000
  batch_max: 500
epics: []
```

Each entry in `epics` is also merged with per-epic defaults of `data_retention_mb: 10` and `data_retention_days: 30`.

After the YAML is parsed, a small set of environment variables is allowed to override specific fields — see "YAML Overrides" below. Everything else in the YAML stays as written.

## Per-Epic Settings

Each entry in the `epics` array describes one collection stream. The fields below apply to every epic; the `monitor` epic adds a few extras for sampling behavior.

### Common fields

| Field | Description | Default |
|-------|-------------|---------|
| `name` | The epic's only identifier. It selects the collector implementation, prefixes the NDJSON files written under `DATA_DIR`, and labels the epic in logs and the orchestrator registry. One of `memory`, `cpu`, `slowlog_len`, `commandlog_slow`, `commandlog_large_request`, `commandlog_large_reply`, `monitor`. | required |
| `poll_ms` | How often (ms) the collector runs. | varies per epic |
| `data_retention_mb` | Max disk space (MB) this epic's NDJSON files may use. Oldest files are evicted when the budget is exceeded. | `10` |
| `data_retention_days` | Files older than this (by birthtime) are deleted during the daily cleanup sweep. | `30` |

Names must match `^[a-z0-9_]+$`; the metrics process refuses to start on anything else, because the name becomes part of a file path. An epic whose name is not one of the values above collects nothing and is dropped at load with an error logged.

The `Default` column shows the **fallback defaults applied by the YAML merge**. `apps/metrics/config.yml` overrides these with lower values per epic (3–15 MB, 5 days). See the file itself for the full per-epic configuration.

### Monitor-only fields

These apply only to the epic named `monitor` and control the `MONITOR`-based hot keys sampling cycle:

| Field | Description | Default |
|-------|-------------|---------------------------|
| `monitoringDuration` | How long each sampling run captures commands (ms). | `10000` |
| `monitoringInterval` | Pause between sampling runs (ms). | `10000` |
| `maxCommandsPerRun` | Hard cap on commands captured per cycle. Cycle ends early when reached. | `1000000` |
| `cutoffFrequency` | Minimum access count for a key to appear in results. | `100` |

## Connecting to Valkey

Connection details come **only** from environment variables. The YAML never carries them, because in the default deployment the server injects them when it spawns a metrics child.

### `VALKEY_HOST`

Host of the Valkey node this metrics process will sample. Required.

### `VALKEY_PORT`

Port of the Valkey node. Required.

### `VALKEY_MODE`

Connection topology used by the Valkey client.

- **`"standalone"`** — single-node client (default)
- **`"cluster"`** — cluster client

If unset, falls back to `valkey.mode` from `config.yml`, then to `"standalone"`.

### `VALKEY_USERNAME`

Username for password or IAM authentication.

### `VALKEY_PASSWORD`

Password for password authentication. Ignored when `VALKEY_AUTH_TYPE=iam`.

### `VALKEY_TLS`

Enable TLS. Compared as the literal string `"true"`.

- **Default:** `false`

### `VALKEY_VERIFY_CERT`

Verify the TLS server certificate. When TLS is enabled and this is `"false"`, certificate verification is skipped — useful for development against self-signed certs, but not for production.

### `VALKEY_AUTH_TYPE`

Selects the credentials provider.

- **`"iam"`** — use AWS ElastiCache IAM authentication via `ElastiCacheIAMProvider`. Requires `VALKEY_USERNAME`, `VALKEY_AWS_REGION`, and `VALKEY_REPLICATION_GROUP_ID`.
- **anything else** — password authentication using `VALKEY_USERNAME` / `VALKEY_PASSWORD`.

### `VALKEY_AWS_REGION`

AWS region used by the IAM credentials provider.

### `VALKEY_REPLICATION_GROUP_ID`

ElastiCache replication group / cluster name used as the IAM `clusterName`.

## Talking Back to the Server

Each metrics process needs to identify itself and tell the Valkey Admin server where to reach it. Two pairs of variables handle this: one pair for the **callback target** (where the server lives), and one pair for the **advertised address** (where the metrics HTTP server can be reached from the server's perspective).

The split matters in container deployments. The metrics process might bind on `0.0.0.0` inside a pod, but the address it should advertise to the orchestrator is the pod IP or service name — not the bind address.

### `SERVER_HOST`

Host of the Valkey Admin server this process should call to register.

- **Default:** `localhost`

### `SERVER_PORT`

Port of the Valkey Admin server.

- **Default:** `8080`

### `METRICS_BIND_HOST`

Network interface the metrics HTTP server binds to. The metrics endpoints have no auth, so keep them on loopback unless the server must reach them from another host — which is the Kubernetes sidecar case.

- **Default:** `127.0.0.1`; `0.0.0.0` for the Kubernetes sidecar

### `METRICS_ADVERTISE_HOST`

Host the metrics process advertises to the server in its registration payload — this is the host the orchestrator will actually dial back. Use it to bridge bind-vs-advertise differences in containers.

Outside Kubernetes the collector runs as a loopback child of the server, which pins the advertised host to loopback and rejects a registration naming any other host with `400`. Set a non-loopback value here only in the Kubernetes sidecar case, where the advertised address is the pod IP or service name. See [Collector authentication](/configuration/server/#collector-authentication).

- **Default:** falls back to `METRICS_HOST`, then `127.0.0.1`

### `METRICS_HOST`

Legacy alias for `METRICS_ADVERTISE_HOST`. Kept for backward compatibility; new deployments should prefer `METRICS_ADVERTISE_HOST`.

### `METRICS_ADVERTISE_PORT`

Port advertised to the server. If unset, the process advertises the actual port assigned by `app.listen()`. This is what makes `PORT=0` work — the OS picks a free port and the process tells the server which one.

### `ORCHESTRATOR_KEY`

Key material used to sign the `register` and `ping` requests. Registration is authenticated, so a collector cannot advertise itself without it.

When the Valkey Admin server spawns this process — Electron, Web, and Docker deployments — it generates a key for this collector alone and injects it, so there is nothing to configure.

Each request carries an HMAC-SHA256 tag over the node id, the advertised URI, and a timestamp, sent in an `X-Orchestrator-Auth` header. Because the advertised URI is part of what is signed, a credential captured off the wire cannot be reused to advertise a different address.

Starting without this variable is fatal by design: the process logs one error and exits rather than sending requests that can only be refused.

- **Default:** unset; supplied by the spawning server
- **Read in:** `apps/metrics/src/utils/orchestrator-auth.js`

Rejections are reported with the server's reason, which distinguishes the common causes:

| Log line | Cause |
|---|---|
| `Register failed: 401 Unauthorized` | Wrong or missing key, or the server has no entry for this node id |
| `Register failed: 400 Invalid metricsServerUri` | Signed correctly, but the advertised URI is not a usable `http`/`https` address, check `METRICS_ADVERTISE_HOST` and `METRICS_ADVERTISE_PORT` |

A ping answered with `401` triggers one re-registration attempt, which recovers a collector whose entry was pruned by the staleness sweep.


## HTTP & Storage

These three variables override the matching fields in `config.yml`. Setting any of them on the environment wins over whatever is in the YAML.

### `PORT`

TCP port the metrics HTTP server listens on. Setting `PORT=0` lets the OS assign an ephemeral port — the server uses this when spawning many metrics children, so they don't fight over fixed ports.

- **Default:** `cfg.server.port` from `config.yml` (`0` — ephemeral port picked by OS)
- **Overrides:** `cfg.server.port`

### `DATA_DIR`

Directory where NDJSON metric files are written and rotated. The server passes a per-node subdirectory here when spawning children, so each child gets its own slice of disk.

- **Default:** `cfg.server.data_dir` from `config.yml` (`/app/data`)
- **Overrides:** `cfg.server.data_dir`

### `CONFIG_PATH`

Absolute path to the `config.yml` file. When set, the metrics process loads its config from this location instead of the bundled `apps/metrics/config.yml`. The Electron build uses this to point at a config file packaged inside the app bundle.

`POST /update-config` writes tuning changes back into this file. Mounting it read-only or serving it from a ConfigMap is supported — updates then apply to the running process only and report `"persisted": false`.

## Collector Tuning

These also override fields under `collector` in `config.yml`. Use them to change batch behavior without editing the YAML.

### `BATCH_MS`

How often (in milliseconds) the collector flushes a batch of samples.

- **Overrides:** `collector.batch_ms`

### `BATCH_MAX`

Maximum number of samples in a single batch. The collector flushes whichever comes first — `BATCH_MS` or `BATCH_MAX`.

- **Overrides:** `collector.batch_max`

## Logging & Debug

### `LOG_LEVEL`

Logger verbosity. Accepted values are the standard `debug` / `info` / `warn` / `error` set; the default is `info`.

If unset, the metrics process inherits `logging.level` from `config.yml`. The environment variable wins when both are set.

### `LOG_FORMAT`

Logger output format.

- **`"pretty"`** — human-readable output (default)
- **`"json"`** — structured JSON lines, intended for log aggregators

If unset, inherits `logging.format` from `config.yml`.

### `DEBUG_METRICS`

When `"1"`, enables verbose metric debug logging in `fetchers.js` and prints the loaded config at startup. Set to `"0"` to disable.

If unset, inherits the boolean `debug_metrics` from `config.yml`. This is the variable to flip when you need to see what the collector is actually doing.
