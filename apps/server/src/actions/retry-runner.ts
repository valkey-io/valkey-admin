import {
  type NodeResult,
  type NodeRetryStatus,
  type NodeStatusUpdate,
  NOT_ATTEMPTED_MESSAGE,
  PER_NODE_TIMEOUT_MS,
  DEFAULT_RETRY_MAX_RETRIES,
  retryDelay
} from "valkey-common"
import {
  runNodeAttempt,
  type CollectionResult,
  type NodeTarget,
  type NodeOp
} from "./node-fanout"

export type { NodeRetryStatus, NodeStatusUpdate }

export interface RetryRunnerOpts {
  // Max retries after the initial attempt
  maxRetries?: number
  // Backoff schedule between attempts, as an explicit per-retry list (ms,
  // clamped to the last entry). Defaults to the shared Fibonacci `retryDelay`
  // from valkey-common.
  delaysMs?: readonly number[]
  // Per-attempt bound
  perAttemptTimeoutMs?: number
  // Aborting stops all pending sleeps and further attempts, the runner
  // resolves promptly with `aborted: true`.
  signal?: AbortSignal
  // Called on every node status transition (attempting/retrying/succeeded/
  // failed/not_attempted). Never called after abort.
  onNodeStatusUpdate: (update: NodeStatusUpdate) => void
}

// The final session outcome
export type RetryRunResult = CollectionResult & { aborted: boolean }

// The runner is policy-agnostic: any feature-specific overrides (e.g. env
// vars) are resolved by the CALLER and passed in via opts, so a second
// consumer does not silently inherit another feature's configuration.
const resolvePolicy = (opts: RetryRunnerOpts): { maxRetries: number; delayForRetry: (retryCount: number) => number } => {
  const delaysMs = opts.delaysMs
  return {
    maxRetries: opts.maxRetries ?? DEFAULT_RETRY_MAX_RETRIES,
    delayForRetry: delaysMs
      ? (retryCount) => delaysMs[Math.min(retryCount - 1, delaysMs.length - 1)] ?? 0
      : retryDelay,
  }
}

/** Abortable sleep; resolves early (without throwing) when the signal fires. */
const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      signal?.removeEventListener("abort", done)
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener("abort", done)
  })

/**
 * Run `op` for every target with automatic per-node retry and backoff.
 *
 * Nodes run concurrently; each node's attempts are sequential: attempt →
 * on failure wait out the backoff (shared Fibonacci `retryDelay` by default)
 * → retry, up to `maxRetries` retries.
 * Every transition is emitted via `onNodeStatusUpdate`.
 * Targets without a `metricsURI` are never attempted: they emit one
 * `not_attempted` status and land in `notAttempted`.
 *
 * NOTE: a per-attempt timeout aborts the underlying request, but the request
 * may have already reached the node before the abort; the next attempt then re-sends.
 * Node ops must therefore be idempotent.
 *
 * Aborting (via `opts.signal`) cancels pending sleeps and the in-flight
 * attempt's request (chained through `runNodeAttempt`), suppresses further
 * attempts and emits, and resolves promptly with `aborted: true`.
 */
export async function runWithRetry(
  targets: NodeTarget[],
  op: NodeOp,
  opts: RetryRunnerOpts,
): Promise<RetryRunResult> {
  const { maxRetries, delayForRetry } = resolvePolicy(opts)
  const perAttemptTimeoutMs = opts?.perAttemptTimeoutMs ?? PER_NODE_TIMEOUT_MS
  const signal = opts?.signal
  const maxAttempts = maxRetries + 1

  const emit = (update: NodeStatusUpdate): void => {
    if (signal?.aborted) return
    opts.onNodeStatusUpdate(update)
  }

  const notAttempted: string[] = []
  const attemptedTargets: NodeTarget[] = []
  for (const target of targets) {
    if (target.metricsURI) {
      attemptedTargets.push(target)
    } else {
      notAttempted.push(target.nodeId)
      emit({
        nodeId: target.nodeId,
        status: "not_attempted",
        attempt: 0,
        maxAttempts,
        message: NOT_ATTEMPTED_MESSAGE,
      })
    }
  }

  const runNode = async (target: NodeTarget): Promise<NodeResult> => {
    let lastResult: NodeResult = {
      nodeId: target.nodeId,
      success: false,
      message: "Not attempted",
    }
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal?.aborted) return lastResult
      emit({ nodeId: target.nodeId, status: "attempting", attempt, maxAttempts })

      lastResult = await runNodeAttempt(target, op, perAttemptTimeoutMs, signal)
      if (signal?.aborted) return lastResult

      if (lastResult.success) {
        emit({ nodeId: target.nodeId, status: "succeeded", attempt, maxAttempts })
        return lastResult
      }

      if (attempt < maxAttempts) {
        const nextRetryMs = delayForRetry(attempt)
        emit({
          nodeId: target.nodeId,
          status: "retrying",
          attempt,
          maxAttempts,
          nextRetryMs,
          message: lastResult.message,
        })
        await sleep(nextRetryMs, signal)
      }
    }

    emit({
      nodeId: target.nodeId,
      status: "failed",
      attempt: maxAttempts,
      maxAttempts,
      message: lastResult.message,
    })
    return lastResult
  }

  const attempted = await Promise.all(attemptedTargets.map(runNode))
  return { attempted, notAttempted, aborted: Boolean(signal?.aborted) }
}
