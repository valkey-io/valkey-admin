# valkey-admin Steering Doc

## Architecture

### Stack
- **Frontend**: React + Redux Toolkit + RxJS epics (rxjs middleware), React Router, Tailwind
- **Backend**: Node.js WebSocket server (`apps/server`)
- **Metrics sidecar**: Express server per node (`apps/metrics`) — JS, not TS
- **Shared constants**: `common/src/constants.ts` — `makeNamespace` generates action type strings

### Communication
- Frontend ↔ Server: WebSocket only. All actions are dispatched via `store.dispatch(message)` on incoming WS messages — no special routing needed, action `type` drives everything.
- Server ↔ Metrics: HTTP (`fetch`) per node

### State keying
- Standalone: keyed by `connectionId`
- Cluster/config endpoint: keyed by `clusterId`
- `hotKeysId = clusterId ?? connectionId` — used consistently in frontend selectors

---

## Connection Flow

### Standalone
`connectPending` → server creates `GlideClient` → `standaloneConnectFulfilled`

### Cluster (node address)
`connectPending` → server discovers cluster via `CLUSTER SLOTS` → creates `GlideClusterClient` → `clusterConnectFulfilled`

### Config endpoint (`endpointType === "cluster-endpoint"`)
Previously: connected to first node via `connectToFirstNode`, started two metrics servers (one for config endpoint id, one for node id), stored both in `connectedNodesByCluster` causing double fan-out on all cluster operations.

**New flow (branch: `fix/config-endpoint-redirect`):**
1. Server discovers cluster nodes, then immediately sends `configEndpointRedirect` with `{ fromId, toId, connectionDetails }` — no client created, nothing stored
2. Frontend epic intercepts: dispatches `deleteConnection(fromId)` + `connectPending(toId, nodeConnectionDetails)`
3. Server receives `connectPending` for real node address → normal cluster connect → one metrics server → `clusterConnectFulfilled`

`connectToFirstNode` in `utils.ts` was deleted as part of this.

---

## Cluster Registry & Fan-out

- `clusterNodesRegistry` (server): `{ [clusterId]: { [nodeConnectionId]: nodeDetails } }` — used by hotkeys to fan out HTTP requests to all node metrics servers
- `connectedNodesByCluster` (server): `Map<clusterId, connectionId[]>` — used by monitor, config, commandLogs, memoryUsage, cpuUsage, closeConnection to fan out WS/HTTP actions
- Both must only contain real node `connectionId`s — never the config endpoint id

---

## Hot Keys Flow

1. `hotKeysRequested({ connectionId, clusterId })` dispatched from `Monitoring.tsx` on mount, on `monitorRunning` change, and on manual refresh
2. Epic (`getHotKeysEpic`) enriches with `lfuEnabled` + `clusterSlotStatsEnabled` from Redux state, forwards to server via WebSocket
3. Server fans out to all nodes in `clusterNodesRegistry[clusterId]`, fetches `/hot-keys` from each metrics server
4. Results aggregated, sent back as `hotKeysFulfilled` keyed by `clusterId`
5. Errors collected per-node as `NodeError[]`, included in `hotKeysFulfilled` payload as `nodeErrors` (cluster path only)

### Monitor not running
Metrics server returns `400 { error: "Monitor is not running" }` when monitor is off. This means all nodes return `NodeError`, `results` is empty. Fix: send `hotKeysFulfilled` with empty `hotKeys` so frontend transitions out of `PENDING`.

### Key fix: `results` filter
```ts
settled.filter((r): r is HotKeysResponse => !!r && ("hotKeys" in r || "monitorRunning" in r))
```
Responses without `hotKeys` (e.g. `{ checkAt }`) are still valid and must pass through.

---

## Metrics Server

- One per node, started by `startMetricsServer(connectionDetails, connectionId)`
- Registers itself with backend server on startup
- `/hot-keys` endpoint: if `useHotSlots=true` → uses LFU slot stats; otherwise calls `useMonitor(res, client)`
- `useMonitor`: returns `400` if monitor not running, `{ checkAt }` if monitor running but not ready, `{ hotKeys, ... }` when ready
- `checkAt` flow: server waits `checkAt - Date.now()` ms then re-fetches

---

## Monitor

- Started/stopped per node via `monitorRequested` with `monitorAction: "start"|"stop"|"status"`
- Fans out to all nodes in `connectedNodesByCluster` when `clusterId` present
- State stored per individual `connectionId` in Redux (not per `clusterId`)
- Starting monitor via config endpoint page fans out to all cluster nodes simultaneously

---

## Frontend Patterns

- WS messages dispatched directly: `store.dispatch(message)` — action `type` must match slice action type exactly
- Epics use `select(actionCreator)` helper to filter action stream
- New action types must be added to both `common/src/constants.ts` AND as a slice action (even if reducer is a no-op) for `select()` to work
- `configEndpointRedirect` is a no-op reducer, handled entirely in epic

---

## Conventions

- Max line length: 145 chars
- No double metrics servers for same node
- Errors for cluster path collected and returned in `hotKeysFulfilled`, not sent as individual `hotKeysError` per node
- `nodeErrors` only populated on cluster path — standalone uses `hotKeysError` directly
