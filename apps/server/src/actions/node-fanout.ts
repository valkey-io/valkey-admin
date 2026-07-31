import {
  type NodeResult,
  type ReplyOutcome,
  MAX_NODE_MESSAGE_LEN,
  MISSING_MESSAGE,
  NODE_TIMEOUT_MESSAGE,
  PER_NODE_TIMEOUT_MS
} from "valkey-common"

export interface NodeTarget {
  nodeId: string
  metricsURI: string | undefined
}

/** The outcome of a fan-out. */
export interface CollectionResult {
  attempted: NodeResult[]
  notAttempted: string[]
}

/**
 * The per-node operation. `signal` aborts when the attempt times out or the
 * caller cancels (e.g. a superseded retry session); ops SHOULD honor it (e.g.
 * pass it to `fetchWithTimeout`) so the underlying request is torn down. An op
 * that ignores the signal still cannot hang the attempt — the timeout race in
 * `runNodeAttempt` bounds resolution regardless — it just degrades to
 * abandonment (the request keeps running in the background).
 */
export type NodeOp = (
  target: NodeTarget,
  signal?: AbortSignal,
) => Promise<{ success: boolean; message: string }>

/**
 * Normalize an outcome message into a non-empty string clamped to
 * MAX_NODE_MESSAGE_LEN.
 */
function normalizeMessage(message: unknown, fallback: string = MISSING_MESSAGE): string {
  const raw = typeof message === "string" ? message : ""
  const base = raw.length === 0 ? fallback : raw
  return base.length > MAX_NODE_MESSAGE_LEN ? base.slice(0, MAX_NODE_MESSAGE_LEN) : base
}

/**
 * Run ONE attempt of `op` for one target, bounded by `timeoutMs`.
 *
 * Two cancellation mechanisms:
 * - The timeout RACE guarantees bounded resolution even for an op that
 *   ignores its signal (the timeout NodeResult wins the race).
 * - The per-attempt ABORT signal lets a cooperative op tear down
 *   its underlying request instead of leaving it running in the background.
 */
export async function runNodeAttempt(
  target: NodeTarget,
  op: NodeOp,
  timeoutMs: number = PER_NODE_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<NodeResult> {
  const attemptController = new AbortController()
  const onCallerAbort = () => attemptController.abort()
  if (signal?.aborted) attemptController.abort()
  else signal?.addEventListener("abort", onCallerAbort)

  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<NodeResult>((resolve) => {
    timer = setTimeout(() => {
      // Kill the underlying request so the message stays the timeout one instead of AbortError.
      attemptController.abort()
      resolve({ nodeId: target.nodeId, success: false, message: NODE_TIMEOUT_MESSAGE })
    }, timeoutMs)
  })

  const work: Promise<NodeResult> = (async () => {
    try {
      const { success, message } = await op(target, attemptController.signal)
      return { nodeId: target.nodeId, success: Boolean(success), message: normalizeMessage(message) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { nodeId: target.nodeId, success: false, message: normalizeMessage(message) }
    }
  })()

  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer) clearTimeout(timer)
    signal?.removeEventListener("abort", onCallerAbort)
  }
}

export function toOutcome(result: CollectionResult): ReplyOutcome {
  if (result.attempted.length === 0) return "not_attempted"
  return result.attempted.some((r) => !r.success) ? "failed" : "fulfilled"
}
