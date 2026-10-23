---
title: Server
description: Configuration for the apps/server process
---

The `apps/server` process is the heart of Valkey Admin. It serves the built frontend, accepts WebSocket connections from the UI, exposes the `/orchestrator` REST router, and — depending on how it is configured — either spawns one metrics child per connection on demand, or runs a long-lived reconcile loop that discovers cluster nodes and tracks externally-managed metrics processes.

The server has no config file. Everything below is read from `process.env` at startup, in `apps/server/src/index.ts` and `apps/server/src/metrics-orchestrator.ts`.

## Picking a Mode

Before touching individual variables, decide which mode the server should run in. `DEPLOYMENT_MODE` is the key switch — it determines which other variables actually matter.

The server runs only as the desktop app, in a Docker container, or in Kubernetes. Running `apps/server` directly on a host (bare metal or a VM, without a container) is not supported: if the server process crashes there, the collectors it spawned keep running and cannot register with a new server.

### Electron mode (desktop default)

When `DEPLOYMENT_MODE=Electron` (or unset in the desktop build), the server spawns a metrics child only for nodes the user has explicitly connected to. The UI initiates a connection, the server spawns a metrics child for that node, the child registers itself, and the server proxies its data back to the UI. When the UI disconnects, the child is killed.

In this mode the server does not need to know anything about Valkey up front — it learns connection details from the UI.

### Web mode (Docker default)

When `DEPLOYMENT_MODE=Web`, the server starts metrics processes for all cluster nodes as soon as any successful connection is made. Set `VALKEY_HOST` / `VALKEY_PORT` (plus any credential variables) to pre-configure the cluster connection on startup.

### Kubernetes mode

When `DEPLOYMENT_MODE=K8`, metrics processes are spawned **outside** the server (as pod sidecars) and call back to `POST /orchestrator/register` to advertise themselves. The server runs a reconcile loop that discovers cluster nodes via `VALKEY_HOST` / `VALKEY_PORT` and prunes stale registry entries older than `TTL` milliseconds.

Each sidecar collects under one set of credentials, so its data cannot be scoped to the user who asks for it. In this release the collector-backed features (dashboard history, hot keys, big keys, command logs, Monitor and collector settings) are not available in Kubernetes and show a message in their place. See [Kubernetes deployment](/deployment/kubernetes/).

## Users and Valkey identities

Valkey Admin has no login of its own. A user's identity is the Valkey user they connect as, and Valkey's ACLs decide what that user may do.

- **Separate clients and collectors per Valkey identity.** The server keeps one Valkey client per connection and one metrics collector per node for each Valkey identity: the auth type and the Valkey username (`default` when no password is given). For ElastiCache IAM, the region and replication group are part of the identity. Users who connect as the same Valkey user share one client and one set of collectors. Users who connect as different Valkey users share nothing, so commands always run as the user's own Valkey user and the metrics they see were collected with their own credentials.
- **Valkey checks every reuse.** The identity is not secret, so it never grants access by itself. Before every connect, the server opens a short-lived connection and sends `AUTH` with the presented credentials. It continues only when Valkey accepts them. Valkey Admin never stores or compares passwords.
- **Failed authentication limit.** After 10 failed authentication attempts in 60 seconds for one node and one Valkey identity, the server rejects new attempts for that pair without contacting Valkey, until the 60-second window ends.
- **Connections belong to the browser connection.** A browser's WebSocket may act only on Valkey connections it opened itself. When the WebSocket drops briefly, the UI reconnects with the credentials it holds in memory. After a full page reload, or in a new tab, the user must enter the password again (the desktop app with an OS keystore reconnects without asking). IAM, GCP IAM and passwordless connections reconnect without a prompt.
- **Release.** A Valkey client is closed about 10 seconds after the last browser that uses it disconnects or closes the connection. The identity's collectors stop when no connection of that identity uses their node. The identity configured with `VALKEY_USERNAME`/`VALKEY_PASSWORD` is an exception: its collectors keep running.

## Network

### `PORT`

The TCP port the Express + WebSocket server listens on. The same port serves the static frontend, the WebSocket endpoint, and the `/orchestrator` REST routes.

- **Default:** `8080`
- **Read in:** `apps/server/src/index.ts`

```bash
PORT=9090
```

### `SERVER_BIND_HOST`

Network interface the server binds to. Defaults to loopback (`127.0.0.1`) so an unauthenticated Web server is not reachable off-host unless you opt in. Web mode has no authentication, so only bind a routable interface when access is otherwise restricted (authenticating proxy, security groups, etc.).

- **Default:** `127.0.0.1` (loopback); `0.0.0.0` when `DEPLOYMENT_MODE=K8`
- **Read in:** `apps/server/src/index.ts`
- **Note:** The Docker image sets `SERVER_BIND_HOST=0.0.0.0` so published ports (`-p`) are reachable; bind the published port to loopback (`-p 127.0.0.1:8080:8080`) to keep it local.

```bash
SERVER_BIND_HOST=0.0.0.0
```

## Mode & Orchestrator

### `DEPLOYMENT_MODE`

Controls how the server manages metrics processes and which nodes get monitored. Accepted values:

- **`Electron`** — spawn metrics only for explicitly connected nodes (desktop default)
- **`Web`** — spawn metrics for all cluster nodes on any successful connection (Docker default)
- **`K8`** — expect externally-managed metrics sidecars that self-register via `/orchestrator/register`. Registration requires a credential these sidecars cannot currently obtain, so this mode does not yet collect metrics; see [Kubernetes deployment](/deployment/kubernetes/).

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

### `ORCHESTRATOR_AUTH_WINDOW_MS`

How far (in milliseconds) a collector's signed timestamp may sit from server time before its credential is refused. Widen this only if collectors and the server run on hosts whose clocks cannot be kept closely in sync.

A registration or ping rejected for skew is logged with the measured offset, so a clock problem is distinguishable from a bad credential:

```text
Rejected metrics registration for 127-0-0-1-6379: stale_timestamp (clock skew 94000ms)
```

- **Default:** `60000`
- **Read in:** `apps/server/src/metrics-orchestrator.ts`

### `ORCHESTRATOR_KEY`

Key material a metrics collector uses to authenticate to `/orchestrator/register` and `/orchestrator/ping`. See [Collector authentication](#collector-authentication) below.

**Do not set this yourself in Electron, Web, or Docker mode.** The server mints a separate key per collector it spawns and injects it into that child, overriding anything inherited from the server's own environment.

- **Default:** unset
- **Read in:** `apps/server/src/metrics-orchestrator.ts`, `apps/metrics/src/utils/orchestrator-auth.js`

### `ORCHESTRATOR_RATE_LIMIT_MAX`

Requests per minute allowed on `/orchestrator/*`, counted per source address and tracked separately from the UI's own limit.

This is effectively a **per-server** budget, not a per-collector one. Spawned collectors all call back to `SERVER_HOST` from the same host, so every collector the server runs shares a single loopback bucket. The server runs one collector per monitored node **per Valkey identity** connected to it (see [Users and Valkey identities](#users-and-valkey-identities)). Each collector sends roughly 6 requests per minute at the default 10s ping interval.

**Sizing guide.** Count the collectors, then multiply by 6:

```text
collectors        = monitored nodes × distinct Valkey identities connected to them
requests per min  = collectors × 6 (at ping_interval 10000 ms)
set the limit to  = requests per min × 1.5 (headroom for registration retries)
```

| Monitored nodes | Distinct Valkey identities | Collectors | Steady-state requests/min | Suggested limit |
|---|---|---|---|---|
| 6 | 1 | 6 | 36 | default |
| 30 | 5 | 150 | 900 | default |
| 30 | 10 | 300 | 1800 | `2700` |
| 100 | 10 | 1000 | 6000 | `9000` |

The default covers about 300 collectors. Raise it when more identities connect to large clusters, or if collectors use a shorter `ping_interval`. A ceiling that is too low shows as collectors logging `Register failed: 429` or `Ping failed: 429`, and nodes that lose their metrics from time to time. Each collector is also a process on the Valkey Admin host and holds connections to Valkey, so size the host too (see [Resource Sizing](/deployment/resource-sizing/)).

- **Default:** `2000`
- **Read in:** `apps/server/src/index.ts`

## Collector Authentication

The `/orchestrator` routes accept writes that change where the server sends its own requests: a registration records the URI the server will later fetch metrics from. Both routes therefore require a credential, and an unauthenticated or unverifiable request is answered with `401` and changes nothing.

For Electron, Web, and Docker deployments this needs no configuration. When the server spawns a collector it generates a random key for that collector alone, keeps it in memory, and passes it to the child through the spawn environment as `ORCHESTRATOR_KEY`. The key is discarded when the collector stops.

The collector signs each request with an HMAC-SHA256 tag over its node id, the URI it is advertising, and a timestamp, and sends the result in an `X-Orchestrator-Auth` header:

```text
POST /orchestrator/register
X-Orchestrator-Auth: v1;<tag>
{"nodeId":"127-0-0-1-6379","metricsServerUri":"http://127.0.0.1:54321","timestamp":1772404800000}
```

Because the advertised URI is covered by the tag, a captured credential cannot be reused to point the server at a different address — it can only re-assert the URI it was issued for. The timestamp bounds how long a captured credential stays usable, and registration and ping credentials are not interchangeable.

Every field in the request body is signed. The server ignores anything else it receives, so an unsigned field cannot influence what gets recorded.

Beyond authentication, the server validates the advertised URI itself. It must be an `http`/`https` origin with no path, query, or fragment. In every non-Kubernetes mode (Electron, Web, Docker) the collector is a loopback child of the server, so its advertised host must be loopback (`127.0.0.1`, `localhost`, or `::1`); a URI naming any other host is rejected with `400`. This is defense in depth — authentication already restricts *who* may register, and this restricts *where* a registration can point the server's own requests, so a collector whose key leaked still cannot turn the server into an SSRF relay. Kubernetes sidecars legitimately advertise a routable pod address and are not subject to the loopback restriction.

A collector that starts without `ORCHESTRATOR_KEY` logs a single error and shuts down rather than issuing requests that can only be refused.

Requests to `/orchestrator/*` are rate limited separately from the UI, defaulting to 2000 per minute per source address — see [`ORCHESTRATOR_RATE_LIMIT_MAX`](#orchestrator_rate_limit_max).

### `VALKEY_ADMIN_ALLOWED_WS_ORIGINS`

Comma-separated list of trusted origins allowed to open a WebSocket connection to the server. Origin validation is enforced in **all** deployment modes — connections with no `Origin` header are always rejected.

- **Web mode:** when unset, allows same-origin (compares `Origin` against the `Host` header). When set, **only** the listed origins are allowed, so include the origin users load the UI from.
- **Electron mode:** allows `file://`, `null` (packaged Electron renderers), and loopback origins (`localhost`, `127.0.0.1`, `::1`) plus any configured origins. Other remote origins are rejected.

```bash
VALKEY_ADMIN_ALLOWED_WS_ORIGINS=https://valkey-admin.example.com,https://other.example.com
```

- **Default:** unset (Web mode enforces same-origin only; Electron mode enforces its allowlist of file:// and loopback)
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

Verify the TLS server certificate. Verification is **on** unless this is set to the literal string `"false"`. Disable it only when you knowingly talk to a node with a self-signed cert and cannot supply its CA via `VALKEY_CA_CERT_PATH`. Verification cannot be disabled for `gcp-iam` — the IAM token is a bearer credential and requires a verified TLS channel.

- **Default:** `true`

### `VALKEY_CA_CERT_PATH`

Filesystem path to a PEM CA certificate used to verify the Valkey server's TLS certificate. Only consulted when `VALKEY_TLS=true` and verification is enabled (`VALKEY_VERIFY_CERT` is not `false`). Glide performs TLS in its Rust core, so a private CA must be supplied this way — Node's trust store and `NODE_EXTRA_CA_CERTS` do not apply. Typical use: mount your server CA (for example a Memorystore for Valkey CA) as a secret and point this at the mounted file.

### `VALKEY_ENDPOINT_TYPE`

Tells the orchestrator how to interpret `VALKEY_HOST` / `VALKEY_PORT` when discovering cluster topology.

- **`"node"`** — the host/port refers to a single cluster node
- **anything else** — treated as `"cluster-endpoint"` (the default)

### `VALKEY_AUTH_TYPE`

Selects the credentials provider for the initial connection.

- **`"iam"`** — use AWS ElastiCache IAM authentication. Requires `VALKEY_USERNAME`, `VALKEY_AWS_REGION`, and `VALKEY_REPLICATION_GROUP_ID`.
- **`"gcp-iam"`** — use GCP Memorystore for Valkey IAM authentication. Mints a short-lived OAuth2 access token from Application Default Credentials (Workload Identity in GKE, the metadata server on GCE, or `GOOGLE_APPLICATION_CREDENTIALS` locally) and rotates it before expiry. Authenticates as the `default` user — the only username Memorystore supports — so `VALKEY_USERNAME` is ignored.
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

### `ORCHESTRATOR_KEY` (set per child, not inherited)

Unlike the variables above, this one is **not** inherited from the server. The server overrides it with a freshly generated per-collector key after copying its own environment, so a value set on the server never reaches a spawned child. See [Collector authentication](#collector-authentication).

### `DATA_DIR`

Base directory for collector data. Each Valkey identity gets its own directory, `${DATA_DIR}/<owner>`, and each collector of that identity writes its NDJSON output to `${DATA_DIR}/<owner>/<nodeId>`. The identity's collector settings file is `${DATA_DIR}/<owner>/config.yml`. The server copies it once from the base config file (`CONFIG_PATH`) and never overwrites it, so a settings change made by one identity never reaches another.

`<owner>` is a readable, reversible encoding of the identity, for example `password~alice`, `password~%41lice` (for `Alice`), `iam~us-east-1~my-rg~iam-user` or `gcp-iam~default`. Lowercase letters, digits, `_`, `-` and `~` stay as they are. Every other byte becomes `%XX`, so names stay distinct on case-insensitive filesystems. Names longer than 200 bytes are cut and get a hash suffix (`~h<hex>`).

History from earlier releases, in `${DATA_DIR}/<nodeId>`, has no known owner. The server does not read it. Delete it when you no longer need it.

- **Default:** `apps/server/data`, resolved relative to the compiled server entry point

## Behaviour & Limits

### `HOT_KEYS_COUNT`

Maximum number of hot keys returned per query. Applies to both monitor-based and slot-stats-based hot key detection. This can also be configured from the Activity view in the UI.

- **Default:** `50`
- **Read in:** `apps/server/src/actions/hotkeys.ts`

### `COMMAND_LOGS_COUNT`

Maximum number of command log entries (slow logs, large requests, large replies) returned per query. This can also be configured from the Activity view in the UI.

- **Default:** `100`
- **Read in:** `apps/server/src/actions/commandLogs.ts`

### `KEY_VALUE_SIZE_LIMIT_BYTES`

Maximum value size (in bytes) the Key Browser will render. Keys larger than this show a size warning instead of their contents.

- **Default:** `2048`
- **Read in:** `apps/server/src/keys-browser.ts`

## Electron Packaging

This variable is set automatically when the server runs as part of the Electron desktop app. It tells the server where to find bundled assets that live outside the workspace `node_modules` layout. You generally do not need to touch it by hand.

### `PROCESS_RESOURCES_PATH`

Absolute path to the bundled Electron resources directory containing `server-metrics.js` and `config.yml`. When set, the server resolves the metrics entry point and `config.yml` from this path instead of the workspace layout.

- **Default:** `""`
- **Read in:** `apps/server/src/metrics-orchestrator.ts`
