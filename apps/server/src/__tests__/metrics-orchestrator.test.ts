 
import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert"
import { GlideClient } from "@valkey/valkey-glide"
import {
  metricsServerMap,
  stopAllMetricsServers,
  reconcileClusterMetricsServers,
  updateClusterNodeRegistry,
  resolveClusterRefreshTarget,
  clients,
  clusterNodesRegistry,
  __test__,
  type ClusterNodeMap, 
  type MetricsServerMap 
} from "../metrics-orchestrator"
import type { ConnectionDetails } from "../actions/connection"

const mockClusterNodesRegistry = new Map<string, ClusterNodeMap>([
  ["cluster-1", {
    node1: {
      host: "127.0.0.1",
      port: 6379,
      tls: false,
      verifyTlsCertificate: false,
    },
  }],
])

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

    it("should NOT remove a node whose only client is keyed `-db<N>`", async () => {
      // N:1 invariant: a single metrics process can serve many user-visible
      // connections under different `db`s. The reconciler must not evict it
      // just because the client is keyed by Connection_Identifier (with `-db`)
      // while the metrics map is keyed by metrics-node-id (without `-db`).
      const now = Date.now()

      const metricsMap: MetricsServerMap = new Map([
        ["127-0-0-1-6379", { metricsURI: "uri", pid: 123, lastSeen: now }],
      ])

      const clusterNodes: ClusterNodeMap = {
        // intentionally missing — standalone, not in any cluster
      }

      // simulate a user connection on db 5 against the same node
      clients.set("127-0-0-1-6379-db5", { client })

      const { nodesToAdd, nodesToRemove } = await __test__.findDiff(metricsMap, clusterNodes)

      assert.strictEqual(nodesToRemove.includes("127-0-0-1-6379"), false)
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

  describe("register endpoint", () => {
    afterEach(() => {
      mock.restoreAll()
      metricsServerMap.clear()
    })

    it("should accept registration when nodeId exists in metricsServerMap", () => {
      metricsServerMap.set("127-0-0-1-6379", { metricsURI: "", pid: 123, lastSeen: Date.now() })

      assert.strictEqual(metricsServerMap.has("127-0-0-1-6379"), true)
    })

    it("should reject registration when nodeId is not in metricsServerMap", () => {
      assert.strictEqual(metricsServerMap.has("unknown-node-6379"), false)
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
      await __test__.startMetricsServers({ node1: nodes }, "cluster-1")

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

    beforeEach(() => {
      metricsServerMap.clear()

      // Mock all side-effectful internal functions
      mock.method(__test__, "createClient", async () => ({}))
      mock.method(__test__, "updateClusterNodeRegistry", async () => mockClusterNodesRegistry)
      mock.method(__test__, "updateMetricsServers", async () => {})
      mock.method(__test__, "findDiff", async () => ({ nodesToAdd: {}, nodesToRemove: [] }))
    })
    afterEach(() => {
      mock.restoreAll()
      // The registry is a module global now, so a seeded cluster would leak
      // into the next test.
      clusterNodesRegistry.clear()
    })

    it("should early return if registry is empty", async () => {
      const findDiff = mock.method(__test__, "findDiff", async () => ({ nodesToAdd: {}, nodesToRemove: [] }))
      clusterNodesRegistry.clear()

      await reconcileClusterMetricsServers(metricsServerMap)

      // No clusters to reconcile, so the diff is never computed.
      assert.strictEqual(findDiff.mock.callCount(), 0)
    })

    it("should early return if nothing changed", async () => {
      const findDiff = mock.method(__test__, "findDiff", async () => ({ nodesToAdd: {}, nodesToRemove: [] }))
      const updateMetricsServers = mock.method(__test__, "updateMetricsServers", async () => {})
      clusterNodesRegistry.set("cluster-1", {
        node1: { host: "127.0.0.1", port: 6379, tls: false, verifyTlsCertificate: false },
      })

      await reconcileClusterMetricsServers(metricsServerMap)

      // The cluster is inspected, but findDiff reports no changes, so no
      // metrics servers are started or stopped.
      assert.strictEqual(findDiff.mock.callCount(), 1)
      assert.strictEqual(updateMetricsServers.mock.callCount(), 0)
    })
  })

  describe("topology refresh", () => {
    beforeEach(() => {
      mock.restoreAll()
      clients.clear()
      metricsServerMap.clear()
      clusterNodesRegistry.clear()
    })
    afterEach(() => {
      mock.restoreAll()
      clients.clear()
      metricsServerMap.clear()
      clusterNodesRegistry.clear()
    })

    it("updateClusterNodeRegistry replaces stale topology with the freshly discovered one", async () => {
      // Seed a stale registry: cluster "node-1" knows only one node.
      clusterNodesRegistry.set("node-1", {
        "192-168-1-1-6379": { host: "192.168.1.1", port: 6379, tls: false, verifyTlsCertificate: false },
      })

      // A live client for that cluster whose CLUSTER SLOTS now reports three
      // primaries. (SLOTS parsing itself is covered in connection.test.ts.)
      const client = {
        customCommand: async (args: string[]) =>
          args[0] === "CLUSTER" && args[1] === "SLOTS"
            ? [
              [0, 5460, ["192.168.1.1", 6379, "node-1"]],
              [5461, 10922, ["192.168.1.3", 6379, "node-2"]],
              [10923, 16383, ["192.168.1.4", 6379, "node-3"]],
            ]
            : [],
      } as never

      const sampleNode = Object.values(clusterNodesRegistry.get("node-1") ?? {})[0]
      await updateClusterNodeRegistry(client, sampleNode)

      assert.deepStrictEqual(
        Object.keys(clusterNodesRegistry.get("node-1") ?? {}).sort(),
        ["192-168-1-1-6379", "192-168-1-3-6379", "192-168-1-4-6379"],
        "registry should reflect the newly discovered topology, not the stale snapshot",
      )
    })

    it("overwrites the existing entry when a known clusterId is passed, even if the derived id changed", async () => {
      // Existing cluster tracked under "orig-id".
      clusterNodesRegistry.set("orig-id", {
        "192-168-1-1-6379": { host: "192.168.1.1", port: 6379, tls: false, verifyTlsCertificate: false },
      })

      // After a failover, CLUSTER SLOTS now lists a different first primary, so the
      // derived clusterId would be "new-first-primary" — which would orphan "orig-id".
      const client = {
        customCommand: async (args: string[]) =>
          args[0] === "CLUSTER" && args[1] === "SLOTS"
            ? [[0, 16383, ["192.168.1.9", 6379, "new-first-primary"]]]
            : [],
      } as never

      const sampleNode = Object.values(clusterNodesRegistry.get("orig-id") ?? {})[0]
      await updateClusterNodeRegistry(client, sampleNode, "orig-id")

      assert.deepStrictEqual(
        [...clusterNodesRegistry.keys()],
        ["orig-id"],
        "the known clusterId should be overwritten in place, leaving no orphaned entry",
      )
      assert.deepStrictEqual(
        Object.keys(clusterNodesRegistry.get("orig-id") ?? {}),
        ["192-168-1-9-6379"],
        "the entry should hold the freshly discovered node",
      )
    })

    it("resolveClusterRefreshTarget uses the user client and carries node metadata forward", async () => {
      const userClient = { id: "user-client" } as never
      const clusterNodes = {
        node1: { host: "10.0.0.1", port: 6379, tls: true, verifyTlsCertificate: false, username: "admin", authType: "iam" as const },
      }

      const target = await resolveClusterRefreshTarget("cluster-1", clusterNodes, userClient)

      assert.strictEqual(target?.client, userClient, "should refresh with the cluster's own live client")
      // nodeInfo must be a node from THIS cluster (preserving its tls/username/auth),
      // not initialConnectionDetails.
      assert.deepStrictEqual(target?.nodeInfo, clusterNodes.node1, "should carry the cluster's own node metadata forward")
    })

    it("resolveClusterRefreshTarget skips a cluster with no live client when not preconfigured", async () => {
      // DEPLOYMENT_MODE is unset in this file, so preConfiguredConnection is falsy
      // and there is no initial client to fall back to.
      const target = await resolveClusterRefreshTarget(
        "cluster-1",
        { node1: { host: "10.0.0.1", port: 6379, tls: false, verifyTlsCertificate: false } },
        undefined,
      )
      assert.strictEqual(target, undefined, "a cluster with no live client and no preconfigured fallback is skipped")
    })
  })
})
