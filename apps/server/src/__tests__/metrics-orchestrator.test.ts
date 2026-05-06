 
import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert"
import { GlideClient } from "@valkey/valkey-glide"
import {
  metricsServerMap,
  stopAllMetricsServers,
  reconcileClusterMetricsServers,
  clients,
  clusterNodesRegistry,
  __test__,
  type ClusterNodeMap, 
  type MetricsServerMap 
} from "../metrics-orchestrator"
import type { ConnectionDetails } from "../actions/connection"

const mockClusterNodesRegistry = {
  "cluster-1": {
    node1: {
      host: "127.0.0.1",
      port: 6379,
      tls: false,
      verifyTlsCertificate: false,
    },
  },
}

describe("metrics-orchestrator", () => {
  describe("findDiff", () => {
    let client: GlideClient
    beforeEach(() => {
      client = {} as GlideClient
    })
    afterEach(() => {
      mock.restoreAll()
      metricsServerMap.clear()
    })
    it("should return nodes to add if not in metricsMap", async () => {
      const clusterNodes: ClusterNodeMap = {
        node1: { host: "127.0.0.1", port: "6379", tls: false, verifyTlsCertificate: false },
        node2: { host: "127.0.0.2", port: "6379", tls: false, verifyTlsCertificate: false },
      }
      const metricsMap: MetricsServerMap = new Map([
        ["node1", { metricsURI: "uri", pid: 123, lastSeen: Date.now() }],
      ])
      const { nodesToAdd, nodesToRemove } = await __test__.findDiff(metricsMap, clusterNodes)
      assert.strictEqual(Object.keys(nodesToAdd).length, 1)
      assert.strictEqual(nodesToAdd.node2.host, "127.0.0.2")
      assert.strictEqual(nodesToRemove.length, 0)
    })

    it("should return nodes to remove if not in clusterMap", async () => {
      const clusterNodes: ClusterNodeMap = {
        node1: { host: "127.0.0.1", port: "6379", tls: false, verifyTlsCertificate: false },
      }
      const now = Date.now()
      const metricsMap: MetricsServerMap = new Map([
        ["node1", { metricsURI: "uri", pid: 123, lastSeen: now }],
        ["node2", { metricsURI: "uri", pid: 456, lastSeen: now }],
      ])
      const { nodesToAdd, nodesToRemove } = await __test__.findDiff(metricsMap, clusterNodes)
      assert.strictEqual(Object.keys(nodesToAdd).length, 0)
      assert.strictEqual(nodesToRemove.length, 1)
      assert.strictEqual(nodesToRemove[0], "node2")
    })

    it("should remove stale nodes", async () => {
      const clusterNodes: ClusterNodeMap = {
        node1: { host: "127.0.0.1", port: "6379", tls: false, verifyTlsCertificate: false },
      }
      const pastTime = (Date.now() - 100000)
      const metricsMap: MetricsServerMap = new Map([
        ["node1", { metricsURI: "uri", pid: 123, lastSeen: pastTime }],
      ])
      const { nodesToAdd, nodesToRemove } = await __test__.findDiff(metricsMap, clusterNodes)
      assert.strictEqual(nodesToAdd.node1, undefined)
      assert.strictEqual(nodesToRemove.includes("node1"), true)
    })
    it("should NOT remove nodes that exist in clients even if not in clusterMap", async () => {
      const now = Date.now()

      const metricsMap: MetricsServerMap = new Map([
        ["node1", { metricsURI: "uri", pid: 123, lastSeen: now }],
      ])

      const clusterNodes: ClusterNodeMap = {
        // node1 intentionally missing
      }

      // simulate active client for node1
      clients.set("node1", { client })

      const { nodesToAdd, nodesToRemove } = await __test__.findDiff(metricsMap, clusterNodes)

      // should NOT be removed because it's still in clients
      assert.strictEqual(nodesToRemove.includes("node1"), false)
      assert.strictEqual(Object.keys(nodesToAdd).length, 0)
    })

    // We only store data from primary nodes. This can be a TODO
    // it("should keep replica metrics servers because replicas belong to the cluster map", async () => {
    //   const now = Date.now()
    //   const clusterNodes: ClusterNodeMap = {
    //     "valkey-0-valkey-headless-valkey-svc-cluster-local-6379": {
    //       host: "valkey-0.valkey-headless.valkey.svc.cluster.local",
    //       port: "6379",
    //       tls: false,
    //       verifyTlsCertificate: false,
    //       replicas: [
    //         {
    //           id: "replica-raw-id",
    //           host: "valkey-5.valkey-headless.valkey.svc.cluster.local",
    //           port: 6379,
    //         },
    //       ],
    //     },
    //   }
    //   const metricsMap: MetricsServerMap = new Map([
    //     ["valkey-5-valkey-headless-valkey-svc-cluster-local-6379", { metricsURI: "uri", pid: 123, lastSeen: now }],
    //   ])

    //   const { nodesToAdd, nodesToRemove } = await __test__.findDiff(metricsMap, clusterNodes)

    //   assert.strictEqual(nodesToRemove.length, 0)
    //   assert.strictEqual(Object.keys(nodesToAdd).includes("valkey-5-valkey-headless-valkey-svc-cluster-local-6379"), false)
    // })
  })

  describe("isKnownClusterNode", () => {
    afterEach(() => {
      mock.restoreAll()
      for (const key in clusterNodesRegistry) {
        delete clusterNodesRegistry[key]
      }
    })

    it("should recognize replica node ids by sanitized host-port", () => {
      clusterNodesRegistry["cluster-1"] = {
        "valkey-0-valkey-headless-valkey-svc-cluster-local-6379": {
          host: "valkey-0.valkey-headless.valkey.svc.cluster.local",
          port: 6379,
          tls: false,
          verifyTlsCertificate: false,
          replicas: [
            {
              id: "raw-replica-node-id",
              host: "valkey-5.valkey-headless.valkey.svc.cluster.local",
              port: 6379,
            },
          ],
        },
      }

      assert.strictEqual(
        __test__.isKnownClusterNode("valkey-5-valkey-headless-valkey-svc-cluster-local-6379"),
        true,
      )
    })
  })

  describe("startMetricsServer / stopMetricsServer", () => {
    afterEach(() => {
      mock.restoreAll()
      metricsServerMap.clear()
    })
    it("should spawn a new metrics server", async () => {
      const nodes = {
        host: "127.0.0.1",
        port: "6379",
        tls: false,
        verifyTlsCertificate: false,
      }

      mock.method(
        __test__,
        "startMetricsServers",
        async (nodesMap: Record<string, ConnectionDetails>) => {
          // simulate inserting all nodes into metricsServerMap
          for (const [key, node] of Object.entries(nodesMap)) {
            metricsServerMap.set(key, { metricsURI: node.host, pid: 999, lastSeen: 123 })
          }
        },
      )
      await __test__.startMetricsServers({ node1: nodes })

      // Assert that the node was added to metricsServerMap
      assert.strictEqual(metricsServerMap.has("node1"), true)
      const entry = metricsServerMap.get("node1")
      assert.strictEqual(entry?.pid, 999)
    })

    it("should stop a metrics server by killing pid", async () => {
      let killedPid: number | undefined
      metricsServerMap.set("node1", { metricsURI: "uri", pid: 1234, lastSeen: Date.now() })
      mock.method(process, "kill", (pid: number) => {
        killedPid = pid
      })

      await __test__.stopMetricsServer("node1")
      assert.strictEqual(killedPid, 1234)
      assert.strictEqual(metricsServerMap.has("node1"), false)
    })
    it("should kill all metrics servers and clear the map safely", async () => {
      const killed: number[] = []
      metricsServerMap.set("node1", { metricsURI: "uri", pid: 1, lastSeen: 1 })
      metricsServerMap.set("node2", { metricsURI: "uri", pid: 2, lastSeen: 2 })
      mock.method(process, "kill", (pid: number) => killed.push(pid))

      await stopAllMetricsServers(metricsServerMap)
      assert.strictEqual(metricsServerMap.size, 0)
      assert.strictEqual(killed.includes(1), true)
      assert.strictEqual(killed.includes(2), true)
    })
  })

  describe("reconcileClusterMetricsServers", () => {
    let connectionDetails: ConnectionDetails

    beforeEach(() => {
      metricsServerMap.clear()
      connectionDetails = { host: "127.0.0.1", port: "6379", tls: false, verifyTlsCertificate: false, endpointType: "node" }

      // Mock all side-effectful internal functions
      mock.method(__test__, "createClient", async () => ({}))
      mock.method(__test__, "getClusterTopology", async () => ({
        clusterNodes: {
          node1: { host: "127.0.0.1", port: "6379", tls: false, verifyTlsCertificate: false },
        },
        clusterId: "cluster-1",
      }))
      mock.method(__test__, "updateClusterNodeRegistry", async () => mockClusterNodesRegistry)
      mock.method(__test__, "updateMetricsServers", async () => {})
      mock.method(__test__, "findDiff", async () => ({ nodesToAdd: {}, nodesToRemove: [] }))
    })
    afterEach(() => {
      mock.restoreAll()
    })

    it("should discover cluster if registry is empty", async () => {
      await reconcileClusterMetricsServers(
        mockClusterNodesRegistry,metricsServerMap, connectionDetails)
      assert.ok(mockClusterNodesRegistry["cluster-1"])
    })

    it("should early return if nothing changed", async () => {
      // findDiff mock returns empty changes
      mock.method(__test__, "findDiff", async () => ({ nodesToAdd: {}, nodesToRemove: [] }))
      mockClusterNodesRegistry["cluster-1"] = {
        node1: { host: "127.0.0.1", port: 6379, tls: false, verifyTlsCertificate: false },
      }
      await reconcileClusterMetricsServers(
        mockClusterNodesRegistry,metricsServerMap, connectionDetails)
      // updateMetricsServers should not be called because nothing changed
    })
  })
})
