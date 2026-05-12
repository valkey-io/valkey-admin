---
title: Configuration
description: Runtime, build-time, and code-level configuration for the Valkey Admin server, metrics, and frontend processes
---

Valkey Admin is composed of three processes — a **server** that handles WebSocket and orchestrator traffic, one or more **metrics** processes that sample a Valkey node, and a **frontend** Vite/Electron client. Together with the shared `common` package they expose three kinds of configuration:

- **Environment variables** read at startup from `process.env`
- **YAML config** loaded by the metrics process from `config.yml`
- **Code-level constants** in `common/src/constants.ts` that act as compile-time tunables

This section documents every knob the application actually reads, what it does, and which process consumes it.

## Process Overview

| Process | Purpose | Docs |
|---|---|---|
| `apps/server` | Express + WebSocket server, metrics orchestrator | [Server](/configuration/server/) |
| `apps/metrics` | Per-node metrics collector that registers with the server | [Metrics](/configuration/metrics/) |
| `apps/frontend` | React/Vite client (browser or Electron) | [Frontend](/configuration/frontend/) |
| `common` | Shared constants compiled into both server and frontend | [Shared constants](/configuration/shared/) |

## Where Configuration Comes From

Each process has a slightly different story. Read this once and the rest of the section will make sense.

### Server

The server reads everything from environment variables at startup. There is no config file.

What it cares about:

- Its own listen port (`PORT`).
- Which mode to run in (`DEPLOYMENT_MODE`). 
   - Accepts:
      - `Electron` — spawns a metrics child only for nodes the UI explicitly connects to (Desktop default)
      - `Web` — spawns metrics children for every cluster node on first successful connection (Docker default)
      - `K8` — does not spawn children; expects externally-managed metrics sidecars to self-register via `/orchestrator/register` (Kubernetes)
   - **Note**: In `Web` and `K8` modes, set `VALKEY_HOST` / `VALKEY_PORT` plus the rest of the `VALKEY_*` credential variables so the server can discover cluster nodes on its own. 
   - See [Picking a Mode](/configuration/server/#picking-a-mode) for the full breakdown.
- In `Electron` and `Web` modes the server **spawns** a metrics child process per node. It copies its own environment into the child and overrides a handful of values (`VALKEY_HOST`, `VALKEY_PORT`, credentials, `DATA_DIR`, `CONFIG_PATH`, `CONNECTION_ID`) so each child knows which node it is sampling.

In short: configure the server, and most of its settings flow through to the metrics children automatically.

### Metrics

The metrics process has **two** sources of configuration, and they layer on top of each other:

1. **`config.yml`** — loaded from `apps/metrics/config.yml` by default, or from the path in `CONFIG_PATH`. This file holds collector definitions, per-epic retention rules, server defaults, and logging defaults.
2. **Environment variables** — a small set is allowed to override values from the YAML at load time:
   - `PORT` overrides `server.port`
   - `DATA_DIR` overrides `server.data_dir`
   - `BATCH_MS` overrides `collector.batch_ms`
   - `BATCH_MAX` overrides `collector.batch_max`
   - `LOG_LEVEL` and `LOG_FORMAT` override the matching fields under `logging`
   - `DEBUG_METRICS` overrides the top-level `debug_metrics` flag

Connection details (`VALKEY_HOST`, `VALKEY_PORT`, credentials, TLS, AWS/IAM settings) come **only** from environment variables — the YAML never carries them, because in normal mode they are injected by the server when it spawns the child.

### Frontend

The frontend is a Vite build, so its configuration is captured at **build time** and baked into the bundle. There is nothing to set at runtime in the browser.

Two flavors:

- **`VITE_*` variables** (`VITE_LOCAL_VALKEY_HOST`, `VITE_LOCAL_VALKEY_PORT`, `VITE_LOCAL_VALKEY_NAME`) are inlined via `import.meta.env` and used to prefill a "local Valkey" entry in the connection list.
- **`VALKEY_ADMIN_WS_URL`** is read from `process.env` in `wsEpics.ts` and overrides the WebSocket URL the client dials. Use this when the frontend is served from a different origin than the server (for example behind a reverse proxy).

To change any frontend setting you must rebuild.

### Shared constants

`common/src/constants.ts` is compiled into both the server and the frontend bundles. It contains:

- Plain code constants (`FETCH_TIMEOUT_MS`, `RETRY_CONFIG`, scan defaults, eviction interval) that you tune by editing the file and rebuilding.
- One environment variable: **`MAX_CONNECTIONS`**, which caps how many simultaneous Valkey connections the UI will allow. Because it is read inside `common`, it is captured at build time, not at browser runtime.

### A starter file

A starter `env.example` listing the most common variables lives at `apps/metrics/env.example`.
