---
title: Shared Constants
description: Configurable values exported from common/src/constants.ts and shared across processes
---

The `common/src/constants.ts` module is a small file with outsized importance — it is bundled into both the server and the frontend, so any value defined here ends up running on both sides of the application. The file mostly holds plain code constants that act as compile-time tunables, plus one environment variable that controls how many simultaneous Valkey connections the UI will allow.

Because `common` is captured at build time, every value below — including the lone environment variable — is frozen into the bundle when you run `npm run build`. Changing any of them means rebuilding the affected app.

## The One Environment Variable

### `MAX_CONNECTIONS`

Hard cap on the number of simultaneous Valkey connections the UI will allow. The frontend uses it to disable the "Connect" button on cluster nodes once the cap is reached, to surface an "at limit" message in the connection modal, and to short-circuit search highlighting in the connection list.

When unset, the cap is `Infinity` and the UI will happily open as many connections as the user clicks.

- **Default:** `Infinity` (no limit)
- **Type:** number
- **Read in:** `common/src/constants.ts` → `process.env.MAX_CONNECTIONS`
- **Used in:** `apps/frontend/src/components/cluster-topology/`, `apps/frontend/src/components/connection/`, `apps/frontend/src/components/ui/connection-modal.tsx`, `apps/frontend/src/state/valkey-features/connection/connectionSelectors.ts`

```bash
# Limit the UI to 10 simultaneous connections
MAX_CONNECTIONS=10
```

This is the variable to set when you want to prevent users from accidentally fan-out-connecting to every node in a large cluster. Because the value is read inside `common` at build time, it is captured then and there — setting `MAX_CONNECTIONS` in the browser or in the running server has no effect.

## Code-Level Tunables

Everything below is a plain code constant. There is no environment variable for any of them — to change them, edit `common/src/constants.ts` and rebuild. They are documented here because this is the canonical place to tune these behaviors, and because their defaults are easy to forget.

### `FETCH_TIMEOUT_MS`

Default timeout (in milliseconds) for fetch-based requests issued through common helpers. Bump this when you are talking to a slow or distant Valkey deployment and seeing spurious timeouts in the UI.

- **Default:** `10000`

### `RETRY_CONFIG`

Controls the Fibonacci backoff used by the shared retry helper (`retryDelay`). The helper computes `BASE_DELAY * fib(retryCount)`, then clamps the result to `MAX_DELAY`.

| Field | Default | Meaning |
|---|---|---|
| `MAX_RETRIES` | `8` | Maximum retry attempts before giving up |
| `BASE_DELAY` | `1000` ms | Multiplier applied to the Fibonacci sequence |
| `MAX_DELAY` | `30000` ms | Upper bound on any single backoff delay |

The Fibonacci shape gives short retries early (when the failure is likely transient) and longer retries later (when the failure looks persistent), without ever waiting more than `MAX_DELAY` between attempts.

### `VALKEY_CLIENT.SCAN`

Defaults used when the key browser issues `SCAN` against a Valkey instance. They are only used when the user has not specified their own values.

| Field | Default | Meaning |
|---|---|---|
| `defaultPayloadPattern` | `"*"` | MATCH pattern when none is supplied |
| `defaultCount` | `50` | COUNT hint when none is supplied |

Tune `defaultCount` if you find the key browser is making too many round-trips on large keyspaces.

### `VALKEY_CLIENT.KEY_VALUE_SIZE_LIMIT`

Maximum key value size, in bytes, that the UI will render inline. Values larger than this are replaced with the placeholder defined in `VALKEY_CLIENT.MESSAGES.NOT_READABLE` ("Not human readable.") to avoid rendering huge blobs in the browser.

- **Default:** `2048` (2 KiB)

### `METRICS_EVICTION_POLICY.INTERVAL`

How often the metrics eviction sweep runs. The default of one day is appropriate for typical deployments; lower it if you need tighter retention enforcement, or raise it to reduce sweep churn.

- **Default:** `1 * MILLISECONDS_IN_A_DAY` (24 hours)

### `LOCAL_STORAGE.VALKEY_CONNECTIONS`

The browser `localStorage` key under which the frontend persists saved connections. Only worth changing if you are running two builds of Valkey Admin against the same origin and need them to keep separate connection lists.

- **Default:** `"VALKEY_CONNECTIONS"`

## Database Index

Each connection carries a `db` field on its `ConnectionDetails` payload — the logical Valkey database the client binds to. The server creates a separate client per `(host, port, db)` triple, so switching to a different `db` opens a fresh connection rather than mutating an existing one. The connection identifier the server uses to key its in-memory client map is built by `buildConnectionId(host, port, db)` from `common/src/connection-id.ts`; both the frontend and the server import the same helper so identical inputs always produce identical keys.

- **Type:** non-negative integer
- **Default:** `0` (Valkey's default database)
- **Valid range:** `0` through `databases - 1`, where `databases` is whatever the target Valkey server reports for its `databases` config (Valkey's default is `16`, giving `0..15`). Out-of-range values are rejected with a `connectRejected` error.
- **Cluster mode:** servers at Valkey/Redis `9.0.0` or higher honor a non-zero `db`. Older cluster servers only support `db: 0` and the server rejects non-zero values for those clusters with a clear error.

### Connection form

The "Add Connection" modal in the frontend exposes `db` as a **Database** dropdown next to the Auth and TLS fields.

- **Options:** exactly 16 entries, labeled `DB 0` through `DB 15`, mapping to the integer values `0..15`.
- **Default:** `DB 0`, matching the `db: 0` default that ships in `ConnectionDetails`.
- **Cluster discovery endpoint:** when the user picks the cluster discovery endpoint (i.e. `endpointType === "cluster-endpoint"`, including the implicit switch triggered by typing a host containing `cfg`), the dropdown is disabled and the form coerces `db` back to `0` before dispatching. This pinning is intentional — most cluster deployments do not support a non-zero database index, and the server-side gating described above will reject those connections anyway.
- **Validation:** before dispatching `connectPending` or `discoveryEndpointPending`, the form re-checks that `db` is an integer in `0..15`. With the fixed dropdown plus cluster coercion this branch should never trigger from normal use; it exists as a defensive guard against state injection and surfaces an inline error under the Database field if it does.
