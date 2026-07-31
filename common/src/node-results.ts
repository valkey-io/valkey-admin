/**
 * Per-node fan-out result, reply, and live status types shared by the Server
 * and the Frontend.
 *
 * The websocket reply payload is `AggregateReplyId & NodeResultsReply` — exactly one
 * id arm (`{ clusterId }` for a cluster or db-less `{ nodeId }` for a
 * standalone node) plus the per-node body. For a standalone reply,
 * `nodeResults` contains exactly one entry whose `nodeId` equals the reply's
 * `nodeId`.
 */

import type { AggregateReplyId } from "./reply-id"

export interface NodeResult {
  nodeId: string
  success: boolean
  message: string
}

export type ReplyOutcome =
  | "fulfilled" // every attempted node succeeded (failedNodes empty)
  | "failed" // at least one attempted node failed (partial or total)
  | "not_attempted" // no targeted node had a registered Metrics_Process

/**
 * Per-node config/slot-stats reply body. Combined with an AggregateReplyId
 * in the websocket payload.
 */
export interface NodeResultsReply {
  outcome: ReplyOutcome
  nodeResults: NodeResult[]
  appliedConfig?: Record<string, unknown>
  // Targeted nodes with no registered Metrics_Process; never attempted, so
  // they are reported distinctly from Failed_Nodes.
  notAttemptedNodeIds?: string[]
}

/**
 * Per-node lifecycle status of a session with server-side automatic retry. 
 * Pushed live to the frontend whenever a node transitions.
 */
export type NodeRetryStatus =
  | "attempting" // an attempt is in flight
  | "retrying" // last attempt failed; waiting out the backoff delay
  | "succeeded" // terminal: the node succeeded.
  | "failed" // terminal: retries exhausted
  | "not_attempted" // terminal: no registered metrics process

/** One node status transition emitted by the retry runner. */
export interface NodeStatusUpdate {
  nodeId: string
  status: NodeRetryStatus
  attempt: number // 1-based attempt number; 0 for not_attempted.
  maxAttempts: number // Total attempts allowed (initial attempt + max retries).
  nextRetryMs?: number // Delay before the next attempt, present only on "retrying".
  message?: string // Failure message only for "retrying" and "failed".
}

/**
 * Websocket payload of a live per-node status push: the target id arm
 * (`AggregateReplyId`: `{ clusterId }` or standalone `{ nodeId }`) plus the
 * node transition. On a standalone push the update's `nodeId` equals the
 * arm's `nodeId`.
 */
export type NodeStatusPush = AggregateReplyId & NodeStatusUpdate

