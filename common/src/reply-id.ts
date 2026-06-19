/**
 * Explicit id-space envelopes for server → frontend reply payloads.
 *
 * Every metrics reply identifies itself with exactly one id-space so producer
 * and consumer never disagree. Two shapes exist, distinguished by how the frontend stores the
 * resulting state:
 *
 *   - `AggregateReplyId` — the reply is stored as a SINGLE entry per cluster (or
 *     per standalone connection). Used by features that aggregate all cluster
 *     nodes server-side into one result.
 *
 *   - `NodeReplyId` — the reply is stored PER NODE. Used by features that keep
 *     per-node state on the frontend.
 *
 * Both share the standalone arm `{ connectionId }` (db-suffixed
 * Connection_Identifier). No field ever holds a different id-space than its
 * name; `clusterId`/`nodeId` are db-less, `connectionId` is db-suffixed.
 */

/** Cluster-scoped or standalone reply, stored as one entry per cluster/connection. */
export type AggregateReplyId =
  | { clusterId: string }
  | { connectionId: string }

/** Per-node (cluster) or standalone reply, stored as one entry per node/connection. */
export type NodeReplyId =
  | { clusterId: string; nodeId: string }
  | { connectionId: string }
