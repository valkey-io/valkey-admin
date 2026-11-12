---
title: AI Assistants (MCP)
description: Let AI assistants such as Claude Code and Cursor read Valkey data through Valkey Admin
---

Valkey Admin includes a read-only [MCP](https://modelcontextprotocol.io) server. AI assistants that support MCP, such as Claude Code and Cursor, can use it to read server info, big keys and hot keys from your Valkey deployments.

```
AI assistant --HTTP--> MCP server --WebSocket--> Valkey Admin server --> Valkey
```

The MCP server never connects to Valkey directly. It talks to the Valkey Admin server like one more browser tab, and the server does the Valkey work.

The MCP server needs Web mode. It is not available in the desktop app.

## Tools

| Tool | Returns | Parameters | Standalone | Cluster |
|---|---|---|---|---|
| `get_server_info` | INFO and memory data | None | Yes | Connected node only |
| `get_big_keys` | Largest keys by memory | `topN` (default 20), `scanLimit` per node (default 10000) | Yes | All nodes |
| `get_hot_keys` | Most frequently accessed keys | `count` (default 20) | No | All nodes |

`get_hot_keys` requires cluster mode, `cluster-slot-stats-enabled yes` and an LFU `maxmemory-policy` such as `allkeys-lfu`. See [Hot Slots Detection](/features/activity/#hot-slots-detection-recommended).

`get_big_keys` adds load to each node it scans. `scanLimit` applies per node, so a three-node cluster with the default limit can scan up to about 30,000 keys.

## Enable it in Docker

Set `VALKEY_ADMIN_MCP_ENABLED=true`, a token of at least 32 characters and the Valkey deployments the assistant may read:

```bash
docker run -d --name valkey-admin -p 127.0.0.1:8080:8080 \
  -e VALKEY_ADMIN_MCP_ENABLED=true \
  -e VALKEY_ADMIN_MCP_TOKEN="$(openssl rand -hex 32)" \
  -e VALKEY_ADMIN_MCP_TARGETS="prod=valkey-prod:6379,cache=valkeys://valkey-cache:6380" \
  -e VALKEY_ADMIN_MCP_USERNAME=mcp_readonly \
  -e VALKEY_ADMIN_MCP_PASSWORD=<password> \
  valkey/valkey-admin
```

The Valkey Admin server starts the MCP server and serves each target on its own port, at `/mcp/<target>`. Here those are `http://localhost:8080/mcp/prod` and `http://localhost:8080/mcp/cache`. Every request must send `Authorization: Bearer <token>`.

The server does not start the MCP server unless both the token and the targets are set, and its log names what is missing. Target hosts are resolved inside the container, so use `host.docker.internal` for Valkey on your machine, or the service name for Valkey in the same Compose project.

See [MCP Server](/configuration/server/#mcp-server) for every variable.

## Add it to your AI assistant

Add one entry per target. For a cluster, one target is enough: point it at any node, and Valkey Admin finds the other nodes.

```bash
claude mcp add --transport http valkey-prod http://localhost:8080/mcp/prod \
  --header "Authorization: Bearer <token>"
```

Other assistants accept the same settings as JSON, though the file location and exact format vary:

```json
{
  "mcpServers": {
    "valkey-prod": {
      "type": "http",
      "url": "http://localhost:8080/mcp/prod",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

In Claude Code, run `/mcp` to confirm the entry is connected, then ask for the big keys of that deployment.

## Read-only Valkey user

Connect as a dedicated Valkey user that can read but not write. `+@read -@dangerous` is not enough: Valkey Admin also needs `INFO`, `CONFIG GET` and `COMMANDLOG GET`, which are in `@dangerous`, and `MEMORY STATS`, `CLUSTER SLOTS` and `CLUSTER SLOT-STATS`, which are not in `@read`. This rule allows exactly what the tools and the metrics collector use:

```
ACL SETUSER mcp_readonly on >password ~* +@read +@connection +info +memory|stats +config|get +cluster|slots +cluster|slot-stats +commandlog|get +command|info
```

- Writes, `FLUSHALL`, `CONFIG SET`, `KEYS`, `MONITOR` and `CLIENT KILL` stay blocked.
- `CONFIG GET` can read any setting, including `requirepass`, because an ACL cannot limit it to some settings.
- Create the user on every node. A cluster does not replicate ACL users.
- Persist it with `ACL SAVE` when the node uses an ACL file, or `CONFIG REWRITE` when users live in `valkey.conf`. Otherwise it is lost on restart.
- If a tool fails with `NOPERM`, the error names the command; add it with `+<command>`.

## Security

- **Read-only:** the tools take no raw commands, and the MCP server sends only an allowlist of read actions to the Valkey Admin server.
- **Token:** every request must send `VALKEY_ADMIN_MCP_TOKEN`. Requests with a non-local `Origin` are refused.
- **Server-chosen targets:** an assistant can reach only the listed deployments, with the MCP server's own credentials. It never sends a host or password, and `X-Valkey-*` connection headers are refused.
- **Least privilege:** Valkey's ACL is the real access control, so use the [read-only user](#read-only-valkey-user), not `default`.

Valkey Admin itself has no authentication, so keep publishing port `8080` on loopback, as in the example above. See [Docker Deployment](/deployment/docker/).

## Troubleshooting

| Error | What to do |
|---|---|
| `401 Unauthorized` | Send `Authorization: Bearer <token>` with the value of `VALKEY_ADMIN_MCP_TOKEN` |
| `404 Unknown MCP target` | Use `/mcp/<name>` with a name from `VALKEY_ADMIN_MCP_TARGETS` |
| `400 X-Valkey-* headers are not accepted ...` | Remove the `X-Valkey-*` headers from the assistant. The URL chooses the deployment |
| `404` from `/mcp` | `VALKEY_ADMIN_MCP_ENABLED` is not `true` |
| `503` from `/mcp` | The MCP server is not running. The Valkey Admin server log says why: a missing token or targets, a short token or an invalid target entry |
| `No reply from Valkey Admin for ...` | The request passed the 10-second limit. Lower `scanLimit` and try again |
| `Hot keys use cluster slot stats, which need ...` | Apply the settings listed in the error |
| `Metrics server not started` | Metrics are still starting. Try again in a few seconds |
| `NOPERM ...` | The Valkey user lacks a command the tools use. See [Read-only Valkey user](#read-only-valkey-user) |
| `WRONGPASS ...` | Check `VALKEY_ADMIN_MCP_USERNAME` and `VALKEY_ADMIN_MCP_PASSWORD`, and that the user exists on every node |

## Development

`npm run dev` starts the MCP server on `http://localhost:8081/mcp` next to the frontend and the server, without a token or targets. There, the assistant chooses the deployment with `X-Valkey-*` headers. See the [MCP server README](https://github.com/valkey-io/valkey-admin/blob/main/apps/mcp/README.md).
