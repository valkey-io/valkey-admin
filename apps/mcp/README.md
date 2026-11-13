# Valkey Admin MCP Server

A read-only [MCP](https://modelcontextprotocol.io) server that lets AI assistants such as Claude Code and Cursor read Valkey data through Valkey Admin.

```
AI assistant --HTTP--> MCP server --websocket--> Valkey Admin server --> Valkey
```

The MCP server never connects to Valkey directly. It behaves like one more Valkey Admin frontend, and the Valkey Admin server does the Valkey work.

## Two ways to choose the Valkey deployment

| | Targets (Docker and any exposed server) | Headers (local development) |
|---|---|---|
| Who chooses the deployment | The operator, with `VALKEY_ADMIN_MCP_TARGETS` | The AI client, with `X-Valkey-*` headers |
| URL | `/mcp/<target>`, such as `/mcp/prod` | `/mcp` |
| Valkey credentials | `VALKEY_ADMIN_MCP_USERNAME` and `VALKEY_ADMIN_MCP_PASSWORD`, on the server | Headers, or the `VALKEY_*` variables |
| `X-Valkey-*` headers | Refused with `400` | Used |

When `VALKEY_ADMIN_MCP_TARGETS` is set, the MCP server uses targets. Otherwise it uses headers.

## Start the server

Valkey Admin must be running in Web mode. The desktop app is not supported.

### Docker

Set `VALKEY_ADMIN_MCP_ENABLED=true`, a token of at least 32 characters and the targets. The Valkey Admin server starts the MCP server and serves it under `/mcp/` on its own port:

```bash
MCP_TOKEN="$(openssl rand -hex 32)"
echo "$MCP_TOKEN"  # keep it: the assistant sends this token

docker run -d --name valkey-admin -p 127.0.0.1:8080:8080 \
  -e VALKEY_ADMIN_MCP_ENABLED=true \
  -e VALKEY_ADMIN_MCP_TOKEN="$MCP_TOKEN" \
  -e VALKEY_ADMIN_MCP_TARGETS="prod=valkey-prod:6379,cache=valkeys://valkey-cache:6380" \
  -e VALKEY_ADMIN_MCP_USERNAME=mcp_readonly \
  -e VALKEY_ADMIN_MCP_PASSWORD="<password>" \
  valkey/valkey-admin
```

The URLs are `http://localhost:8080/mcp/prod` and `http://localhost:8080/mcp/cache`, and every request must send `Authorization: Bearer <token>`, with the token printed above. The server listens on all interfaces in the container, so it does not start the MCP server unless both the token and the targets are set, and logs which one is missing.

Target hosts are resolved inside the container, where `localhost` is the container itself. Use `host.docker.internal` for Valkey on your machine, or the service name for Valkey in the same Compose project.

### Development

From the repository root, this starts the frontend, the Valkey Admin server and the MCP server together, using headers:

```bash
npm run dev
```

### Standalone process

Build and start only the MCP server. The Valkey Admin server must already be running, and its `VALKEY_ADMIN_ALLOWED_WS_ORIGINS` must include `valkey-admin-mcp://localhost`.

```bash
npm run build:common
npm run build:mcp
npm --workspace apps/mcp run start
```

### How the Valkey Admin server runs it

With `VALKEY_ADMIN_MCP_ENABLED=true`, the server starts the MCP server as a child process and gives it a per-launch websocket token, so its origin does not need to be in `VALKEY_ADMIN_ALLOWED_WS_ORIGINS`. The server forwards `/mcp` and `/mcp/*` on its own port to it. A server bound to loopback needs neither the token nor the targets; any other bind, as in Docker, needs both.

The MCP server itself listens on port `8081` and binds to `127.0.0.1` only.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `VALKEY_ADMIN_MCP_ENABLED` | none | Set to `true` on the Valkey Admin server to have it start the MCP server |
| `VALKEY_ADMIN_MCP_TOKEN` | none | Bearer token callers must send, at least 32 characters |
| `VALKEY_ADMIN_MCP_TARGETS` | none | Comma-separated `name=host:port` entries. Use `name=valkeys://host:port` for TLS. Names use letters, digits, `-` and `_` |
| `VALKEY_ADMIN_MCP_USERNAME` | none | Valkey username for every target |
| `VALKEY_ADMIN_MCP_PASSWORD` | none | Valkey password for every target |
| `VALKEY_ADMIN_MCP_PORT` | `8081` | Port the MCP server listens on |
| `VALKEY_ADMIN_URL` | `ws://localhost:8080` | Valkey Admin server websocket |
| `VALKEY_ADMIN_MCP_ORIGIN` | `valkey-admin-mcp://localhost` | Origin sent to the Valkey Admin server |
| `VALKEY_ADMIN_WS_TOKEN` | none | Token sent to the Valkey Admin server. Set by the server when it starts the MCP server; do not set it yourself |
| `VALKEY_HOST` | `localhost` | Header mode: default Valkey host |
| `VALKEY_PORT` | `6379` | Header mode: default Valkey port |
| `VALKEY_USERNAME` | none | Header mode: default Valkey username |
| `VALKEY_PASSWORD` | none | Header mode: default Valkey password |
| `VALKEY_TLS` | `false` | Header mode: default TLS setting |

The `VALKEY_*` connection variables apply only in header mode, to requests that send no `X-Valkey-*` headers. When the Valkey Admin server starts the MCP server, the MCP server inherits them from the server's own environment.

## Tools

| Tool | Returns | Parameters | Standalone | Cluster |
|---|---|---|---|---|
| `get_server_info` | INFO and memory data | None | Yes | Connected node only |
| `get_big_keys` | Largest keys by memory | `topN` (default 20), `scanLimit` per node (default 10000) | Yes | All nodes |
| `get_hot_keys` | Most frequently accessed keys | `count` (default 20) | No | All nodes |

`get_hot_keys` requires cluster mode, `cluster-slot-stats-enabled yes` and an LFU `maxmemory-policy` such as `allkeys-lfu`.

`get_big_keys` adds load to each node it scans. `scanLimit` applies per node, so a three-node cluster with the default limit can scan up to about 30,000 keys.

## Add it to your AI assistant

Create one MCP entry for each Valkey deployment you want to reach. For a cluster, one entry is enough: point it at any node, and Valkey Admin detects the cluster and finds the other nodes.

### Targets

Each target has its own URL, and the only header is the token:

```bash
claude mcp add --transport http valkey-prod http://localhost:8080/mcp/prod \
  --header "Authorization: Bearer <token>"
```

### Headers

All entries use the same URL, and the `X-Valkey-*` headers choose the deployment:

```bash
claude mcp add --transport http valkey-standalone http://localhost:8081/mcp \
  --header "X-Valkey-Port: 6379"

claude mcp add --transport http valkey-cluster http://localhost:8081/mcp \
  --header "X-Valkey-Port: 7001"
```

### Other assistants

Most assistants accept the same settings as JSON, though the file location and exact format vary by assistant:

```json
{
  "mcpServers": {
    "valkey-prod": {
      "type": "http",
      "url": "http://localhost:8080/mcp/prod",
      "headers": { "Authorization": "Bearer <token>" }
    },
    "valkey-standalone": {
      "type": "http",
      "url": "http://localhost:8081/mcp",
      "headers": { "X-Valkey-Port": "6379" }
    }
  }
}
```

## Connection headers

Header mode only.

| Header | Default | Purpose |
|---|---|---|
| `X-Valkey-Host` | `localhost` | Valkey host, as seen by the Valkey Admin server |
| `X-Valkey-Port` | `6379` | Valkey port |
| `X-Valkey-Username` | none | Valkey username |
| `X-Valkey-Password` | none | Valkey password |
| `X-Valkey-Tls` | `false` | Set to `true` to use TLS |

If a request sends any `X-Valkey-*` header, the headers replace the `VALKEY_*` connection variables completely. Unset headers use the defaults above, not the environment values.

Assistants may store headers in plain text in their config files. To keep passwords out of them, use targets.

## Read-only Valkey user

Connect as a dedicated user that can read but not write. The rule grants `@read` and `@connection`, then removes `@dangerous`, which takes away commands such as `KEYS`, `CLIENT KILL` and `CLIENT LIST`. It then adds back only what the tools and the metrics collector use: `INFO`, `CONFIG GET` and `COMMANDLOG GET`, which are in `@dangerous`, and `MEMORY STATS`, `CLUSTER SLOTS` and `CLUSTER SLOT-STATS`, which are not in `@read`. Rules apply in order, so keep `-@dangerous` after the category grants:

```
ACL SETUSER mcp_readonly on >password ~* +@read +@connection -@dangerous +info +memory|stats +config|get +cluster|slots +cluster|slot-stats +commandlog|get +command|info
```

| Allowed | Used for |
|---|---|
| `@read`, `@connection` | Big keys (`SCAN`, `TYPE`, `TTL`, `MEMORY USAGE`, `OBJECT FREQ`), connecting |
| `INFO`, `MEMORY STATS` | Server info and the dashboard data |
| `CONFIG GET` | Reading the eviction policy and `cluster-slot-stats-enabled` |
| `CLUSTER SLOTS`, `CLUSTER SLOT-STATS` | Finding cluster nodes, hot keys |
| `COMMANDLOG GET`, `COMMAND INFO` | The metrics collector |

Writes, `FLUSHALL`, `CONFIG SET`, `KEYS`, `MONITOR`, `CLIENT KILL` and the other admin commands stay blocked. `CONFIG GET` can read any setting, including `requirepass`, because an ACL cannot limit it to some settings.

- Create the user on every node. A cluster does not replicate ACL users.
- Persist it with `ACL SAVE` when the node uses an ACL file, or `CONFIG REWRITE` when users live in `valkey.conf`. Otherwise it is lost on restart.
- Give the MCP server the same username and password for every target, with `VALKEY_ADMIN_MCP_USERNAME` and `VALKEY_ADMIN_MCP_PASSWORD`.
- If a tool fails with `NOPERM`, the error names the command; add it with `+<command>`.

## Check the connection

In Claude Code, run `/mcp` and confirm the entry is connected, then ask:

> Get the big keys for my cluster.

If a cluster result is correct, `nodeId` shows keys from more than one node and `nodeErrors` is empty. Nodes can legitimately be missing from the top results when many keys tie on size.

## Troubleshooting

| Error | What to do |
|---|---|
| `401 Unauthorized` | Send `Authorization: Bearer <token>` with the value of `VALKEY_ADMIN_MCP_TOKEN` |
| `404 Unknown MCP target` | With targets, use `/mcp/<name>` with a name from `VALKEY_ADMIN_MCP_TARGETS`. Without them, use `/mcp` |
| `400 X-Valkey-* headers are not accepted ...` | Remove the `X-Valkey-*` headers from the client. With targets, the URL chooses the deployment |
| `503` from `/mcp` | The MCP server is not running. Check the Valkey Admin server log: a missing token or targets, a short token or an invalid target entry stops it |
| `Cannot reach Valkey Admin at ...` | Start the Valkey Admin server and check `VALKEY_ADMIN_URL`. If it is running, add the MCP origin to its `VALKEY_ADMIN_ALLOWED_WS_ORIGINS`, because a rejected origin shows this same error |
| `No reply from Valkey Admin for ...` | The request passed the 10-second limit. Lower `scanLimit` and try again |
| `Hot keys use cluster slot stats, which need ...` | Apply the settings listed in the error |
| `Metrics server not started` | Metrics are still starting. Tools retry for a few seconds, so try again shortly |
| `NOPERM ...` | The Valkey user lacks a command the tools use. See [Read-only Valkey user](#read-only-valkey-user) |

## Security

- **Read-only:** tools take no raw commands, and the client refuses any websocket action that isn't on its allowlist.
- **Caller check:** the server binds to `127.0.0.1` and refuses non-local `Origin` headers. With `VALKEY_ADMIN_MCP_TOKEN` set, every request must send the token. Without it, the `Host` header must be local, and any local program can call it.
- **Server-chosen targets:** with `VALKEY_ADMIN_MCP_TARGETS`, a caller can reach only the listed deployments, with the MCP server's own credentials, and never sends a host or password. In header mode, a caller can point the Valkey Admin server at any host it can reach, which is why an exposed server requires targets.
- **Least privilege:** connect with a dedicated read-only Valkey user, not `default`, as in [Read-only Valkey user](#read-only-valkey-user). Valkey's ACL is the real access control.
