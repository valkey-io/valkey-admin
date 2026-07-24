# ADR — Cluster fan out retry failed nodes

- **Status:** Accepted
- **Date:** 2026-07-13

## Context

Currently there are 3 cluster fan out actions: update metrics config, monitor start/stop, and enable cluster slot stats. All these fan out actions treat clusters as all-or-nothing. If a single node fails, the entire cluster action is considered failed. 

Using config update as an example, `updateConfig` (`apps/server/src/actions/config.ts`) posts the config to every node with `Promise.all`, finds the *first* failing response with `responses.find((r) => !r.success)`, and emits a single `updateConfigFailed` reply keyed by `clusterId`. A success emits `updateConfigFulfilled` built from only the first node's response. The frontend `configSlice` collapses that into one `"updating" | "updated" | "failed"` status per `Target_Id`. The net effect: one slow or failing node is reported as a total cluster failure, the operator cannot see which nodes failed, and there is no way to retry only the failed nodes.

## Decision

Rework cluster fanout end-to-end so:

1. Node statuses will be classified into `attempting`, `retrying`, `succeeded`, `failed`, `not_attempted`.
  1. `attempting` is for nodes that are actively attempting.
  2. `retrying` is for nodes whose last attempt failed and are waiting out the backoff delay.
  3. `succeeded` is for nodes that have succeeded.
  4. `failed` is for nodes that have failed and have exhausted all retries.
  5. `not_attempted` is for nodes that have no resgistered metrics process and will not be retried.
2. The server will create a session for a cluster fanout action. All further actions will supercede an earlier action.
3. The server will fan out the action to all nodes within the cluster or the sole node in the case for standalone.
4. The server collects **per-node results**, with a retry mechanism following Fibonacci backoff, along with a total limit on number of attempts.
5. Per node statuses are streamed live to the frontend while the run is in progress.
6. When the session resolves, the per-node results are aggregated into a single reply (`sendConfigReply`). The reply is keyed by one `AggregateReplyId` arm (`clusterId` for a cluster, db-less `nodeId` for a standalone) and carries:
  1. an `outcome`: `fulfilled` when every attempted node succeeded, `failed` when any attempted node failed, `not_attempted` when no targeted node had a registered metrics process;
  2. the full `nodeResults` (one per attempted node) and the `notAttemptedNodeIds`;
  3. on `fulfilled` only, the echoed `appliedConfig`.
  On the wire this is just two message types: `updateConfigFulfilled` (sent only for `fulfilled`) and `updateConfigFailed` (sent for both `failed` and `not_attempted`).

### Rationale

**Per-node results instead of first-failure.** The old `responses.find((r) => !r.success)` collapses a whole cluster onto one node's outcome, which hides *which* node failed and *why*, and makes "retry only the failed nodes" impossible. Collecting one settled `NodeResult` per node is the smallest change that unlocks observability, partial-success reporting, and targeted retry — everything else in this decision builds on it.

**Automatic, server-side retry with bounded Fibonacci backoff.** Most fan-out failures are transient (a node briefly unreachable, a metrics process restarting). Retrying absorbs those without operator intervention. Backoff spaces attempts so a struggling node isn't hammered; Fibonacci gives a gentle-then-widening curve. A hard cap on attempts (env-overridable) guarantees the session terminates instead of retrying forever. Retry lives on the server, not the frontend, because the server already owns the per-node connections and the session lifecycle — so the UI needs no retry control and simply renders what it's told.

**A per-target session that supersedes earlier ones.** Operators can fire back-to-back requests for the same target (e.g. re-saving config while a retry session is still backing off). Without arbitration, two sessions would race and could deliver conflicting aggregate replies. Registering one session per `Target_Id` and aborting the in-flight one on a new request guarantees at most one live session per target and exactly one authoritative final reply. The abort is synchronous (before any await) so two requests can't both hold the slot, and a superseded session suppresses its aggregate reply so it can't overwrite the newer outcome.

**Live per-node streaming *and* a final aggregate reply.** These serve different jobs and neither replaces the other. The live pushes are progress UX — best-effort, tolerant of loss. The aggregate reply is the authoritative commit: it reconciles any in-flight node statuses to terminal values, carries data the pushes cannot (the echoed applied config, the partial-vs-total classification, the consolidated not-attempted list), signals completion, and is the value downstream server logic gates on.

**`not_attempted` distinct from `failed`.** A node with no registered metrics process cannot apply the operation, but that is a configuration fact, not a failure. Conflating it with `failed` would trigger pointless retries and misreport an otherwise-successful fan-out. Modeling it separately means these nodes are never attempted, never retried, never counted against success, and are surfaced distinctly in the UI. This is also why a `fulfilled` reply can still carry a non-empty not-attempted list.

**Isolating a single-attempt primitive from retry policy.** The bounded single attempt (`runNodeAttempt`, in `node-fanout.ts`) is kept free of any scheduling or backoff policy; the retry runner (`runWithRetry`, in `retry-runner.ts`) composes it. Concentrating timeout and message-normalization semantics in one primitive lets a strategy layer own retry policy on top, so a future non-retrying or differently-scheduled fan-out can reuse the same attempt semantics without duplicating them. Retrying is only safe because the per-node ops are idempotent settings writes — a per-attempt timeout can record a failure while the POST is still in flight, and the next attempt simply re-POSTs to the same converged state.

## Consequences

### What this enables

- **Cluster fan-out is no longer all-or-nothing.** The aggregate reply carries an `outcome` of `fulfilled`, `failed`, or `not_attempted`, plus the per-node `nodeResults` and `notAttemptedNodeIds`. Only two message types are sent: `updateConfigFulfilled` (for `fulfilled`, which also echoes `appliedConfig`) and `updateConfigFailed` (covering both `failed` and `not_attempted`). Partial success is not a wire outcome — the frontend derives `partial` vs total `failed` from the per-node results, and `not_attempted` nodes are reported distinctly rather than counted as failures.
- **Failed nodes are retried automatically.** Transient failures recover without operator action (Fibonacci backoff, capped attempts); only nodes still failing after the cap surface as `failed`.
- **Per-node observability.** Operators see which node failed, its message, and its attempt count, replacing the old single first-failure summary. The frontend renders live per-node statuses (`attempting`/`retrying`/`succeeded`/`failed`/`not_attempted`), a partial-success status, and malformed-reply bookkeeping.
- **Outcome-gated follow-ups.** The combined save flow (config push then monitor toggle) gates the toggle on per-node config results: only config-succeeded nodes are toggled, and the toggle is skipped entirely on total failure or when the session was superseded.

### New obligations / constraints

- **More server-side state and complexity.** The server now holds a per-target session registry with abort controllers, supersede/cleanup bookkeeping, and a retry loop, versus a single `Promise.all`. This is the main ongoing cost.
- **Higher latency for genuinely failing nodes.** A node that will ultimately fail is only reported after exhausting its retry schedule, so partial failures take longer to surface than the old fail-fast behavior — an intentional trade of latency for resilience.
- **Idempotency is a hard requirement.** A per-attempt timeout can record a failure while the POST is still in flight, so the next attempt re-POSTs. Every op run through the retry runner must be a safe-to-repeat write, and new retrying fan-outs must preserve this invariant.
- **Aborted-session results must be ignored.** A superseding session owns the target; acting on a superseded session's results (e.g. toggling monitor from a stale config outcome) would be incorrect. Consumers of `runWithRetry` must honor this contract.

### Current scope / rollout

The design applies to all cluster fan-out actions, but adoption is incremental and **not yet complete**:

- **Config update** (`updateConfig`, and the config portion of the combined monitor-save flow) is the only path that currently runs through the session + retry machinery (`runWithRetry`).
- **Enable cluster slot stats** (`enableClusterSlotStats`) was *not* migrated — it remains a fire-and-forget `Promise.all` of `CONFIG SET` (all-or-nothing, no per-node results, carries a `// TODO` for its frontend). It is still all-or-nothing.
- **Monitor start/stop** does not go through `runWithRetry`; it uses its own per-node reply handling.
- The earlier one-shot collector (`collectNodeResults`) was removed; `node-fanout.ts` now exposes only the shared primitives (`runNodeAttempt`, `toOutcome`, types), composed by the retry runner. If a future non-retrying fan-out needs settled per-node collection, that helper will need to be reintroduced on top of `runNodeAttempt`.
