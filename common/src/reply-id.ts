/**
 * Explicit id-space envelopes for server → frontend reply payloads.
 *
 * Every metrics reply identifies itself with exactly one id-space so producer
 * and consumer never disagree. Two shapes exist, distinguished by how the frontend stores the
 * resulting state:
 *
 *   - `AggregateReplyId` — the reply is stored as a SINGLE entry per cluster or
 *     per standalone node. Used by features that aggregate all cluster
 *     nodes server-side into one result (config, hotkeys, commandlogs).
 *
 *   - `NodeReplyId` — the reply is stored PER NODE. Used by features that keep
 *     per-node state on the frontend (monitor).
 *
 * No metrics reply carries a db-suffixed `{ connectionId }` arm, every reply
 * identifies itself by `clusterId` (cluster) or `nodeId` (standalone/per-node),
 * both of which are db-less.
 */

/** Cluster-scoped or standalone reply, stored as one entry per cluster/node. */
export type AggregateReplyId = { clusterId: string } | { nodeId: string }

/** Per-node (cluster) or standalone reply, stored as one entry per node. */
export type NodeReplyId =
  | { clusterId: string; nodeId: string }
  | { nodeId: string }
