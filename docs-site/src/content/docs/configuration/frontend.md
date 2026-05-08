---
title: Frontend
description: Configuration for the apps/frontend Vite + Electron client
---

The `apps/frontend` package is a React app built with Vite. The same bundle runs in two places: inside an Electron window for the desktop app, and in a regular browser when served by the Valkey Admin server. There is no runtime config file — every setting below is captured at **build time** and baked into the JavaScript bundle, so changing any of them means rebuilding the frontend.

There are only a handful of variables, but they fall into two distinct groups: ones that prefill a default "local Valkey" entry in the connection list, and one that overrides the WebSocket URL the client dials.

Type definitions for the supported variables live in `apps/frontend/src/vite-env.d.ts`.


## Server WebSocket URL

### `VITE_VALKEY_ADMIN_WS_URL`

Overrides the WebSocket URL the frontend connects to. Read via `import.meta.env` in `apps/frontend/src/state/epics/wsEpics.ts`.

When unset, the frontend chooses a URL automatically based on where it is running:

- **Electron** (`window.location.protocol === "file:"`) → `ws://localhost:8080`
- **HTTPS browser** → `wss://${window.location.host}`
- **HTTP browser** → `ws://${window.location.host}`

The automatic choice works for the common cases — Electron talking to a local server, or a browser served by the same host that runs the WebSocket. Set `VITE_VALKEY_ADMIN_WS_URL` when neither holds: typically when the frontend is served from a different origin than the server (a CDN, a separate static host, or a reverse proxy that splits the HTTP and WebSocket traffic).

```bash
VITE_VALKEY_ADMIN_WS_URL=wss://valkey-admin.example.com/ws
```

This is captured at build time. To change the WebSocket target you must rebuild the frontend with the new value.
