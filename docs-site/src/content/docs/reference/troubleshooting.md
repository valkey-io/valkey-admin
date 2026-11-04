---
title: Troubleshooting
description: Common issues and solutions for Valkey Admin
---

## Valkey Admin is crashing or unresponsive with a large cluster

In Web/Docker mode, Valkey Admin spawns a metrics server process for each primary node in the cluster. Each process uses approximately 150 MB of RAM. If your instance doesn't have enough memory, the app will OOM and become unresponsive.

**Fix:** Refer to the [Resource Sizing](/deployment/resource-sizing/) page and ensure your instance meets the recommended spec for your cluster size. Alternatively, deploy with [Kubernetes](/deployment/kubernetes/) where metrics servers run as sidecars on each Valkey pod, eliminating the memory burden on the main Valkey Admin instance.

---

## I enabled cluster slot stats and an LFU eviction policy but Valkey Admin still prompts me to start monitoring

Valkey Admin checks your cluster's eviction policy and slot stats configuration at connection time, not continuously. If you enabled `allkeys-lfu` or `cluster-slot-stats-enabled` after connecting, Valkey Admin won't detect the change. This also applies in the reverse direction.

**Fix:** Delete your cluster connection(s) in Valkey Admin and reconnect. The new connection will pick up the updated configuration.

---

## I am unable to enable cluster slot stats on Valkey

This option requires Valkey 8.0 or later, which introduced `cluster-slot-stats-enabled`. On older versions, Valkey Admin will offer monitor-based detection instead.

---

## I just connected to my cluster and see multiple unresponsive nodes

**Fix:** Metrics servers need a moment to start up after a connection is established.

---

## Monitor or Command Logs show an error banner

If the Monitor or Command Log features display an error in the Activity view, the metrics server was unable to execute the required command on the connected node. Common causes:

- The connected Valkey instance does not support the command (e.g., `MONITOR` is disabled or `COMMANDLOG` requires Valkey 8.1+)
- The ACL user does not have permission to run the command
- The node became unreachable after the metrics server started

The error message in the banner indicates the specific failure. If the command is unsupported by the server, the error will persist until the server version or ACL is updated.

---

## Key sampling numbers differ between views

The key browser and the distribution chart use separate sampling passes, so their counts won't always match exactly. This is expected behavior with sampled data — each view samples independently and may pick up a slightly different cross-section of the keyspace.

---

## Connection rejected: `Invalid Database_Index: must be a non-negative integer`

The server rejected the connection because the `db` field on the connection payload wasn't a non-negative integer. This typically means a hand-edited or programmatically built payload sent something like `db: -1`, `db: 1.5`, `db: NaN`, `db: "0"`, or `db: null`. Valid values are `0`, `1`, `2`, … up to `databases - 1`.

**Fix:** Set `db` to a non-negative integer and reconnect. The metrics process applies the same rule to its `VALKEY_DB` environment variable, where invalid values cause the process to exit with code `1`. See [Database Index](/configuration/shared/#database-index) and [`VALKEY_DB`](/configuration/metrics/#valkey_db) for the contract.

---

## Connection rejected: `Database_Index N is out of range: this server has databases = M (valid range 0..M-1)`

The supplied `db` is at or beyond the target server's configured database count. Valkey's `databases` config defaults to `16` (giving `0..15`), but operators can lower or raise it. The server reads this value via `CONFIG GET databases` on the probe client before binding the requested database, so the bound depends on what the server is actually configured for, not a fixed constant.

**Fix:** Pick a `db` within `[0, databases - 1]`. To check or change the server's bound, run `CONFIG GET databases` against the target node, and `CONFIG SET databases <N>` (or update `valkey.conf` / `redis.conf` and restart) if you need more logical databases. Note that ElastiCache and other managed services may not allow changing `databases`, in which case you must stay within the operator-set limit.

---

## Connection rejected: `Database_Index N is out of range: this cluster has cluster-databases = M (valid range 0..M-1)`

The cluster variant of the error above. Valkey 9.0+ clusters configure their logical database count via `cluster-databases` (falling back to `databases` when unset), and the requested `db` is at or beyond that count.

**Fix:** Pick a `db` within `[0, cluster-databases - 1]`, or raise `--cluster-databases <n>` on every cluster node.

---

## Connection rejected: `Database_Index N is not enabled on this server (it rejected SELECT N)`

The server refused the `SELECT` issued during the connection handshake for the requested database, and the proactive range check couldn't run beforehand — typically because `CONFIG GET` is denied to the connecting user (e.g. by ACL), so the app couldn't learn the server's configured count.

**Fix:** Run `CONFIG GET databases` (or `cluster-databases` for Valkey 9+ clusters) against the server with a sufficiently privileged user to see its configured count, then choose a database index below it.

---

## Connection rejected: `Cluster server version V does not support a non-zero Database_Index`

The connection target is a cluster running a Valkey/Redis server below `9.0.0`, and the request asked for a non-zero `db`. Multi-database cluster mode is a Valkey 9.0.0+ feature; older cluster servers only support `db: 0`.

**Fix:** Either upgrade the cluster to Valkey 9.0.0 or later, or set `db: 0` for that connection. Standalone connections to the same server version are unaffected — only cluster mode is gated, because cluster servers below 9.0.0 don't expose multiple logical databases at all. See [Database Index](/configuration/shared/#database-index) for the full version contract.

---

## The UI loads but never connects, and the server log says `WebSocket upgrade refused: Host "…" is not a local name`

You reach the UI under a DNS name (a Kubernetes Service or Ingress, a reverse proxy, a LAN hostname) and the server has no `VALKEY_ADMIN_ALLOWED_WS_ORIGINS`. In Web mode with no allowlist, the server accepts a WebSocket only when the `Host` header is `localhost`, a `*.localhost` name or an IP address. Any other name is refused with `403`, because that is the shape of a DNS rebinding attack: a page on the attacker's domain points that domain at `127.0.0.1` and opens a WebSocket to the local server. `kubectl port-forward` and `docker run -p 127.0.0.1:8080:8080` use `localhost`, so they are not affected.

**Fix:** Set `VALKEY_ADMIN_ALLOWED_WS_ORIGINS` to the origin users load the UI from. The log line prints the exact value, for example:

```
WebSocket upgrade refused: Host "valkey-admin.example.com" is not a local name. Set VALKEY_ADMIN_ALLOWED_WS_ORIGINS=https://valkey-admin.example.com to allow it, or VALKEY_ADMIN_ALLOW_ANY_HOST=true to turn this check off.
```

For Kubernetes, add the variable to the app container in your manifest (`examples/k8s/app.yaml` has a commented example). For Docker, pass `-e VALKEY_ADMIN_ALLOWED_WS_ORIGINS=…`. If you cannot list the origins, for example behind an authenticating proxy that serves the UI under many names, `VALKEY_ADMIN_ALLOW_ANY_HOST=true` turns the check off; the server then warns at startup. See [`VALKEY_ADMIN_ALLOWED_WS_ORIGINS`](/configuration/server/#valkey_admin_allowed_ws_origins).

---

## Connection rejected: `GCP IAM authentication requires VALKEY_CA_CERT_PATH`

A `gcp-iam` connection was requested and the server has no `VALKEY_CA_CERT_PATH`. The server mints an access token from its own Google Cloud identity and sends it as the AUTH password to the host you entered. That token is a bearer credential with the `cloud-platform` scope. The CA file is what limits where it can go: Glide uses that file as the only trust root, so the token can reach only a server with a certificate from your Memorystore CA. Without the file, any host with a publicly trusted certificate would receive it.

If the preconfigured connection (`VALKEY_AUTH_TYPE=gcp-iam`) has the same problem, the server logs `Cannot start the preconfigured connection: GCP IAM authentication requires VALKEY_CA_CERT_PATH …` and exits.

**Fix:** Download the instance's server CA (Memorystore's per-instance and shared CA modes require this for any client) and point `VALKEY_CA_CERT_PATH` at the file. In Kubernetes, mount it from a Secret. For a customer-managed CA that your system already trusts, point the variable at the same CA file. The desktop app reads the variable from the environment that launches it. See [`VALKEY_CA_CERT_PATH`](/configuration/server/#valkey_ca_cert_path) and [GCP IAM Authentication](/features/connections/#gcp-iam-authentication).

The related messages `GCP IAM authentication requires TLS` and `… requires TLS certificate verification` mean the connection has TLS off or verification off; turn both on. `AWS IAM authentication requires TLS with certificate verification` is the same rule for ElastiCache IAM.

---

## Connection rejected: `Connection id does not match the host and port`

A raw WebSocket client sent a `connectionId` that was not built from the normalized host and port of the request. The UI builds ids with `normalizeEndpoint` (host trimmed and lowercased, one trailing dot removed, port as a plain number) and never hits this. Connections saved by an earlier version are renamed on load.

**Fix:** Build the id with `buildConnectionId(normalizeEndpoint(host, port), db)` from `valkey-common`. In the UI, edit the connection and connect again.

---

For a list of capabilities and operational caveats that aren't bugs (no built-in auth, no RBAC, mTLS, ElastiCache Serverless, etc.), see [Known Limitations](/reference/limitations/).
