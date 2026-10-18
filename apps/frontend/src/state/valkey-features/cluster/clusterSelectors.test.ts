import { describe, it, expect } from "vitest"
import { buildNodeRows, aggregateClusterMetrics } from "./clusterSelectors"
import type { PrimaryNode, NodeUtilization } from "./clusterSlice"

describe("clusterSelectors", () => {
  const mockClusterNodes: Record<string, PrimaryNode> = {
    "node-primary-1": {
      host: "127.0.0.1",
      port: 7000,
      tls: false,
      verifyTlsCertificate: false,
      replicas: [
        {
          id: "node-replica-1",
          host: "127.0.0.1",
          port: 7001,
        },
      ],
    },
  }

  describe("buildNodeRows", () => {
    it("builds node rows with primary and its replicas", () => {
      const rows = buildNodeRows(mockClusterNodes)
      expect(rows).toHaveLength(2)
      expect(rows[0]).toMatchObject({
        role: "primary",
        host: "127.0.0.1",
        port: 7000,
        isGroupEnd: false,
      })
      expect(rows[1]).toMatchObject({
        role: "replica",
        host: "127.0.0.1",
        port: 7001,
        isGroupEnd: true,
      })
    })
  })

  describe("aggregateClusterMetrics", () => {
    it("flags high utilization nodes across both primaries and replicas", () => {
      const rows = buildNodeRows(mockClusterNodes)
      const mockData = {
        "node-primary-1": {
          instantaneous_ops_per_sec: "150",
          keyspace_hits: "100",
          keyspace_misses: "10",
        },
        "127-0-0-1-7001": {
          instantaneous_ops_per_sec: "50",
          keyspace_hits: "40",
          keyspace_misses: "5",
        },
      }
      const mockUtilization: Record<string, NodeUtilization> = {
        "node-primary-1": {
          nodeId: "node-primary-1",
          used_memory: 1000,
          memory_limit_bytes: 2000,
          memory_basis: "maxmemory",
          memory_utilization_percent: 50,
          cpu_utilization_percent: 85, // high CPU
          cpu_sample_interval_seconds: null,
          warnings: [],
        },
        "127-0-0-1-7001": {
          nodeId: "127-0-0-1-7001",
          used_memory: 500,
          memory_limit_bytes: 2000,
          memory_basis: "maxmemory",
          memory_utilization_percent: 25,
          cpu_utilization_percent: 90, // high CPU on replica
          cpu_sample_interval_seconds: null,
          warnings: [],
        },
      }

      const metrics = aggregateClusterMetrics(rows, mockData, mockUtilization)

      expect(metrics.hasUtilization).toBe(true)
      expect(metrics.usedMemory).toBe(1500)
      expect(metrics.memoryLimit).toBe(4000)
      expect(metrics.opsPerSec).toBe(200)
      expect(metrics.hits).toBe(140)
      expect(metrics.misses).toBe(15)
      // Both primary and replica with high utilization should be flagged
      expect(metrics.flaggedNodes).toBe(2)
    })
  })
})
