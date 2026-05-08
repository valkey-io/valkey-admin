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
