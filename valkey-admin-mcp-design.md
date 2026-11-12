# Valkey Admin MCP Server

Related: [#475](https://github.com/valkey-io/valkey-admin/issues/475)

## Summary

We propose an MCP server that lets AI assistants (Claude Code, Cursor and others) read Valkey data through Valkey Admin. The MCP server will be part of Valkey Admin and run as its own process, started the same way as the frontend. It will act as one more Valkey Admin frontend: it will open its own websocket to the Valkey Admin server, connect to Valkey with the same action the UI sends, and request data with the same actions the dashboard sends. It will be read-only.

The first version has three tools:

- `get_server_info`: the INFO and memory data shown on the dashboard, for the connected node.
- `get_big_keys`: the largest keys by memory, across every node of a cluster.
- `get_hot_keys`: the most frequently accessed keys in a cluster, which needs cluster slot stats and an LFU eviction policy.

## Architecture

```
 Browser ---------------- websocket ----------------+
                                                     |
                                                     v
 AI client --HTTP--> MCP server -- websocket --> Valkey Admin server --> metrics collector --> Valkey
                                                    |                                          ^
                                                    +------------- Glide client ---------------+
```

- Valkey Admin will start the MCP server as a separate process, alongside the frontend and the server.
- The AI client will connect to it over HTTP at a URL. It will not start the MCP server.
- The MCP server will open a websocket to the Valkey Admin server, as the browser does.
- The Valkey Admin server will do all Valkey work: connecting, metrics collection and reading data. The MCP server will never connect to Valkey directly.

## Parallels with the frontend

To the Valkey Admin server, the MCP server will look like one more browser tab: it opens a websocket, connects with the same action and asks for data with the same actions. The table compares the two step by step, with the values used in `npm run dev`.

| | Frontend (today) | MCP server (proposed) |
|---|---|---|
| Started by | `npm run dev` (Vite on `http://localhost:5173`); in Docker, served by the Valkey Admin server itself | `npm run dev`, as its own process listening at `http://localhost:8081/mcp`; in Docker, a child process the Valkey Admin server starts when `VALKEY_ADMIN_MCP_ENABLED=true` |
| Used by | A person in a browser | An AI client configured with the URL `http://localhost:8081/mcp`; in Docker, `http://localhost:8080/mcp/<target>`, which the Valkey Admin server forwards to the MCP server |
| Caller auth | None in Web mode | Locally, none; it listens on `127.0.0.1` only and checks the `Host` and `Origin` headers. In Docker, a bearer token from `VALKEY_ADMIN_MCP_TOKEN` and the `Origin` check |
| Websocket URL | `ws://localhost:8080` from `VITE_VALKEY_ADMIN_WS_URL`; without it, the page's own host | `ws://localhost:8080` from `VALKEY_ADMIN_URL` |
| Origin header | `http://localhost:5173`, set by the browser | `valkey-admin-mcp://localhost`, set by the MCP server from `VALKEY_ADMIN_MCP_ORIGIN` |
| Origin allowlist | `VALKEY_ADMIN_ALLOWED_WS_ORIGINS` must list `http://localhost:5173` | `VALKEY_ADMIN_ALLOWED_WS_ORIGINS` must also list `valkey-admin-mcp://localhost`. When the server starts the MCP server, it passes a per-launch token instead and the allowlist is not needed |
| Who may use a connection | Only the websocket that opened it with credentials Valkey accepted; there are no cookies or sessions | Same rule: only the MCP server's own websocket can use its connection |
| Valkey credentials | Typed in the connection form. Web mode saves the connection in `localStorage` without the password | Locally, `X-Valkey-*` headers in the AI client's config, or `VALKEY_USERNAME` and `VALKEY_PASSWORD` when no headers are sent. With targets, as in Docker, `VALKEY_ADMIN_MCP_USERNAME` and `VALKEY_ADMIN_MCP_PASSWORD` on the server |
| Connection ID | `buildConnectionId(host, port, db)`, such as `localhost-6380-db0` | The same function, always with `db` 0 |
| Connect request | `valkeyConnection/connectPending` with `connectionId` and the form's `connectionDetails` | `valkeyConnection/connectPending` with `connectionId` and `connectionDetails` built from the target, the headers or the environment |
| Credential check | The server proves the credentials with a short-lived Valkey client before connecting; 10 failed AUTHs in 60 seconds per node and user are blocked | The same check and the same limit |
| Connect reply | `standaloneConnectFulfilled`, `clusterConnectFulfilled` or `connectRejected`, handled by the Redux slices and epics | The same three replies, matched by type and `connectionId` |
| Requesting info | `valkeyStats/setData`, sent automatically after connect and again on each refresh | The same action as the page it mirrors, sent when the AI calls a tool. Cluster requests include the `clusterId`, so the server queries every node |
| Info reply | `valkeyStats/setData` with `{ connectionId, info, memory }`, or `valkeyStats/error` with `{ error, errorKind }` | The same replies; `setData` becomes the tool result, `error` becomes a tool error |
| Collector not ready yet | Retries every second, up to 10 times (`METRICS_MAX_RETRIES`) | Retries every second, up to 5 times |
| Valkey identity | The user the person typed, such as `default` | The user in the headers or environment, or with targets, the MCP server's own user. A read-only user, such as `mcp_readonly`, is recommended but not enforced |
| Collector and data | One collector per node for each Valkey user; the dashboard only sees its own user's collector | The same rule: it shares collectors only with sessions of the same Valkey user |
| What it may send | Every UI action, including deleting keys and sending commands | Only actions on a fixed read-only allowlist: `valkeyStats/setData`, `bigKeysRequested` and `hotKeysRequested` |
| After the websocket drops | Reconnects with backoff, then resumes with `isResume`; without a saved password the server asks for it again | The next tool call opens a new websocket and sends `connectPending` with the same credentials |
| When it disconnects | Once its user's last websocket closes, that user's Valkey client and unused collectors stop | Its websockets stay open until the MCP server stops, so its clients and collectors keep running until then |

The server applies the same socket binding, credential check and Valkey ACL to the MCP server that it applies to a browser. In development, the only server change is adding the MCP origin to `VALKEY_ADMIN_ALLOWED_WS_ORIGINS`. That does not carry over to Docker: once that list is set, the server refuses same-origin connections, so the UI would be locked out unless its own origin is listed too. So in Docker the server starts the MCP server itself and trusts its websocket through a per-launch token, the way the desktop app trusts its window, and the allowlist stays unset.

## Choosing the Valkey deployment

One MCP server can serve many Valkey deployments. There are two modes, chosen by whether `VALKEY_ADMIN_MCP_TARGETS` is set.

### Targets (Docker and any exposed server)

The operator lists the deployments on the server, and each is served at its own URL:

```
VALKEY_ADMIN_MCP_TARGETS=prod=valkey-prod:6379,cache=valkeys://valkey-cache:6380
VALKEY_ADMIN_MCP_USERNAME=mcp_readonly
VALKEY_ADMIN_MCP_PASSWORD=...
```

An AI client entry uses `/mcp/prod` or `/mcp/cache` and sends only the bearer token. `valkeys://` turns on TLS. Every target uses the MCP server's own credentials, separate from the server's `VALKEY_*` ones. Requests with `X-Valkey-*` headers get `400`, and unknown names get `404`. A server bound to anything other than loopback starts the MCP server only when both `VALKEY_ADMIN_MCP_TOKEN` and `VALKEY_ADMIN_MCP_TARGETS` are set, so a caller holding the token cannot point it at any other host.

### Headers (local development)

Without targets, each AI client entry uses the same URL, `/mcp`, and picks its deployment with headers:

| Header | Default |
|---|---|
| `X-Valkey-Host` | `localhost` |
| `X-Valkey-Port` | `6379` |
| `X-Valkey-Username`, `X-Valkey-Password` | none |
| `X-Valkey-Tls` | `false` |

The person configuring the client chooses the target, not the AI: no tool takes a host or credentials. For a cluster, any node works. With no `X-Valkey-*` headers, the server's `VALKEY_*` environment is used. With any of them, the headers replace the environment completely.

## Auth

| Step | Frontend (today) | MCP server (proposed) |
|---|---|---|
| Caller to client | A person at the browser | Locally: localhost only, with `Host` and `Origin` checks. Docker: a bearer token (`VALKEY_ADMIN_MCP_TOKEN`) and the `Origin` check, then OAuth |
| Client to Valkey Admin server | Origin `http://localhost:5173`; connections bound to its websocket | Locally: origin `valkey-admin-mcp://localhost`. Started by the server: a per-launch token. Connections bound to its websocket either way |
| Valkey Admin server to Valkey | The typed credentials, checked by Valkey's ACL | The configured read-only user's credentials, checked by Valkey's ACL |

Locally, the MCP server skips a token on purpose. Listening on localhost keeps other machines out, and the `Host` and `Origin` checks stop websites in the user's browser from calling it (DNS rebinding), as the MCP spec asks of local HTTP servers. Any local program can still call it, which is the same exposure the Valkey Admin server on port 8080 has today.

In Docker the MCP server is reachable through the server's published port, so it requires a bearer token of at least 32 characters, compared in constant time. The token replaces the `Host` check, which a proxied or remote request cannot pass; the `Origin` check still applies. The MCP server itself stays bound to `127.0.0.1` inside the container, and only the server's `/mcp` route reaches it.

The origin check stops other websites from connecting. It is not authentication: any local program can send the same header. Valkey's ACL is the real access control, which is why the MCP server should connect as a dedicated read-only Valkey user and never as `default`.

## Read-only

The MCP server will be read-only in three layers:

1. **No raw input.** No tool will accept a command or an action name from the AI. Each tool sends one fixed action.
2. **Action allowlist.** The websocket client will refuse any action not on `READ_ONLY_ACTIONS` before anything is sent. The server's websocket accepts write actions too, so this check is needed.
3. **Valkey ACL.** The read-only Valkey user is the final check. `+@read -@dangerous` is too narrow: connecting and the tools also need `INFO`, `CONFIG GET` and `COMMANDLOG GET` (in `@dangerous`) and `MEMORY STATS`, `CLUSTER SLOTS` and `CLUSTER SLOT-STATS` (not in `@read`). The rule below allows exactly those, was checked against a standalone node and a cluster with all three tools and no ACL denials, and still blocks every write and admin command:

```
ACL SETUSER mcp_readonly on >password ~* +@read +@connection +info +memory|stats +config|get +cluster|slots +cluster|slot-stats +commandlog|get +command|info
```

   `CONFIG GET` can read any setting, including `requirepass`; an ACL cannot narrow it. The user must exist on every cluster node, since ACL users are not replicated.

## Layout

```
apps/mcp/
  src/
    index.ts           HTTP server on localhost, checks the caller and Origin, routes /mcp or /mcp/<target>, registers the tools
    config.ts          reads and validates environment variables, picks the connection for a request
    targets.ts         parses VALKEY_ADMIN_MCP_TARGETS and maps /mcp/<target> to a target
    auth.ts            bearer token check
    admin-client.ts    websocket client: connect, request and reply, allowlist
    tools/
      server-info.ts   get_server_info
      big-keys.ts      get_big_keys
      hot-keys.ts      get_hot_keys
      not-ready.ts     retries while a collector is starting
      tool-result.ts   shared tool reply format

apps/server/src/
  mcp-process.ts       starts and stops the MCP server, forwards /mcp and /mcp/*
  websocket-origin.ts  accepts the MCP server's per-launch token
```

Adding a tool means one file in `tools/`, one entry in `READ_ONLY_ACTIONS` and one `register` call in `index.ts`.

## Known limits

- **Web mode only.** The desktop app's websocket requires a per-launch token that only the app window has, the server does not start the MCP server in the desktop app, and the app does not bundle it.
- **Shared identity.** Server state is keyed by Valkey user. If a person also connects as `mcp_readonly`, they share its Valkey client and collector with the MCP server.
- **Internal protocol.** The websocket actions are not a public API and can change between releases.
- **Server info is per node.** `get_server_info` reports only the node the client connected to; the key tools cover the whole cluster.
- **Credentials in client config.** In header mode, a password sent as a header is stored in plain text in the AI client's config file. Targets keep it on the server.
- **One identity for all targets.** With targets, every target uses the same `VALKEY_ADMIN_MCP_USERNAME` and `VALKEY_ADMIN_MCP_PASSWORD`.
- **Connections stay open.** Each distinct target or set of headers keeps a websocket, Valkey clients and collectors running until the MCP server restarts.
- **No restart.** If the MCP server exits on its own, the Valkey Admin server logs a warning and `/mcp` answers `503` until the container restarts.

## Plan

1. **MVP (done):** `apps/mcp` over HTTP on localhost with `Host` and `Origin` checks, the action allowlist, and the `dev` script starting the MCP server and adding its origin.
2. **More tools (in progress):** big keys and hot keys are done. Next, such as memory, CPU and command logs.
3. **Clusters (mostly done):** big keys and hot keys cover every node. Server info is still per node.
4. **Docker (done):** the image ships the MCP server, and the Valkey Admin server starts it as a child process when `VALKEY_ADMIN_MCP_ENABLED=true`, trusting it through a per-launch token instead of its origin, so the UI keeps working. The server forwards `/mcp` and `/mcp/*` on its own port. On a non-loopback bind it starts the MCP server only with `VALKEY_ADMIN_MCP_TOKEN`, which callers send as a bearer token, and `VALKEY_ADMIN_MCP_TARGETS`, which fixes the deployments callers can reach and gives the MCP server its own credentials.
5. **Next:** restart the MCP server if it exits, docs for the Docker setup, then the MCP authorization standard (OAuth) for per-user access.

## Open questions

| Question | Recommendation |
|---|---|
| Which Valkey identity should the Docker MCP server use? | Decided: one read-only service user, set with `VALKEY_ADMIN_MCP_USERNAME` and `VALKEY_ADMIN_MCP_PASSWORD`. Per-user access through OAuth later. |
| Should the server log rejected origins? | Yes. Today a 403 leaves no trace in the server logs. |
| Which port, and should the MCP server be on by default? | Decided: port 8081 inside, served through the server's port in Docker. On in `npm run dev`; opt-in in Docker with `VALKEY_ADMIN_MCP_ENABLED`. |
| Is skipping a token acceptable for local use? | Decided: yes on a loopback bind, since it matches the server on port 8080. Required on any other bind. |
| Should callers keep choosing the deployment with `X-Valkey-*` headers? | Decided: only in header mode on a loopback bind. Exposed servers require `VALKEY_ADMIN_MCP_TARGETS`, so callers cannot pick any host or send passwords. |
| Should targets have their own credentials? | Not yet: one MCP identity for all targets. Add per-target credentials if deployments need different users. |
