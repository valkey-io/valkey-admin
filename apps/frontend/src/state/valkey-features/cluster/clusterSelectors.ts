import { createSelector } from "@reduxjs/toolkit"
import { VALKEY } from "@common/src/constants.ts"
import { sanitizeUrl } from "@common/src/url-utils.ts"
import * as R from "ramda"
import { getUtilizationLevel } from "./clusterUtilization"
import type { NodeRow, ParsedNodeInfo, NodeUtilization, PrimaryNode } from "./clusterSlice"
import type { RootState } from "@/store.ts"

type ClusterNodesMap = Record<string, PrimaryNode>
type ClusterDataMap = Record<string, ParsedNodeInfo>
type ClusterUtilizationMap = Record<string, NodeUtilization>

export const selectAllClusters = (state: RootState) =>
  R.path<Record<string, { clusterNodes: Record<string, unknown> }>>([VALKEY.CLUSTER.name, "clusters"], state) ?? {}

export const selectClusterData = (id: string) => (state: RootState) =>
  R.path([VALKEY.CLUSTER.name, "clusters", id, "data"], state)

export const selectClusterNodes = (id: string) => (state: RootState) =>
  R.path([VALKEY.CLUSTER.name, "clusters", id, "clusterNodes"], state)

export const selectCluster = (id: string) => (state: RootState) =>
  R.path([VALKEY.CLUSTER.name, "clusters", id], state)

const clusterNodesAt = (state: RootState, id: string) =>
  R.path<ClusterNodesMap>([VALKEY.CLUSTER.name, "clusters", id, "clusterNodes"], state)

const clusterDataAt = (state: RootState, id: string) =>
  R.path<ClusterDataMap>([VALKEY.CLUSTER.name, "clusters", id, "data"], state)

const clusterUtilizationAt = (state: RootState, id: string) =>
  R.path<ClusterUtilizationMap>([VALKEY.CLUSTER.name, "clusters", id, "utilization"], state)

// One row per node, replicas following their primary so the table can group them.
export const buildNodeRows = (clusterNodes: ClusterNodesMap = {}): NodeRow[] =>
  Object.entries(clusterNodes).flatMap(([primaryKey, primary]) => [
    {
      dataKey: primaryKey,
      searchKey: primaryKey,
      host: primary.host,
      port: primary.port,
      role: "primary" as const,
      primary,
      isGroupEnd: primary.replicas.length === 0,
    },
    ...primary.replicas.map((replica, index) => ({
      // INFO keys are sanitized host-port pairs, not Connection_Identifiers.
      dataKey: sanitizeUrl(`${replica.host}-${replica.port}`),
      searchKey: `${replica.host}:${replica.port}`,
      host: replica.host,
      port: replica.port,
      role: "replica" as const,
      primary,
      isGroupEnd: index === primary.replicas.length - 1,
    })),
  ])

export interface ClusterMetrics {
  usedMemory: number
  memoryLimit: number
  opsPerSec: number
  hits: number
  misses: number
  flaggedNodes: number
  hasUtilization: boolean
}

// Totals are sums, not averages of percentages: a busy node counts for more
// than a quiet one. Returns raw numbers so callers own the formatting.
export const aggregateClusterMetrics = (
  nodeRows: NodeRow[],
  data: ClusterDataMap = {},
  utilization: ClusterUtilizationMap = {},
): ClusterMetrics => {
  const metrics: ClusterMetrics = {
    usedMemory: 0,
    memoryLimit: 0,
    opsPerSec: 0,
    hits: 0,
    misses: 0,
    flaggedNodes: 0,
    hasUtilization: false,
  }

  for (const row of nodeRows) {
    const nodeData = data[row.dataKey]
    const nodeUtilization = utilization[row.dataKey]

    if (nodeUtilization) metrics.hasUtilization = true

    metrics.usedMemory += nodeUtilization?.used_memory ?? 0
    metrics.memoryLimit += nodeUtilization?.memory_limit_bytes ?? 0
    metrics.opsPerSec += Number(nodeData?.instantaneous_ops_per_sec) || 0
    metrics.hits += Number(nodeData?.keyspace_hits) || 0
    metrics.misses += Number(nodeData?.keyspace_misses) || 0

    // Badges render on primaries only, so replicas must not inflate the count.
    if (row.role === "primary"
      && getUtilizationLevel(
        nodeUtilization?.memory_utilization_percent,
        nodeUtilization?.cpu_utilization_percent,
      ) === "high") {
      metrics.flaggedNodes += 1
    }
  }

  return metrics
}

// Memoized because it returns a new array; a plain selector would re-render on every dispatch.
export const selectClusterNodeRows = createSelector(
  [clusterNodesAt],
  (clusterNodes) => buildNodeRows(clusterNodes),
)

export const selectClusterMetrics = createSelector(
  [selectClusterNodeRows, clusterDataAt, clusterUtilizationAt],
  aggregateClusterMetrics,
)
