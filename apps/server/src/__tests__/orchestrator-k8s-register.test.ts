import { describe, it, afterEach } from "node:test"
import assert from "node:assert"
import {
  ORCHESTRATOR_AUTH_DOMAIN,
  ORCHESTRATOR_AUTH_HEADER,
  createOrchestratorAuthCredential
} from "valkey-common"
import type { Request, Response } from "express"

// These tests exercise the Kubernetes-only branches of the orchestrator:
//   - resolveCollectorKey falls back to the shared ORCHESTRATOR_KEY, and
//   - handleRegister admits a sidecar whose nodeId is part of the discovered
//     cluster topology even though the orchestrator never spawned it.
// isKubernetes is a module-load constant, so DEPLOYMENT_MODE and the shared key
// must be set BEFORE importing the module.
process.env.DEPLOYMENT_MODE = "K8"
process.env.ORCHESTRATOR_KEY = "k8s-shared-secret"

const {
  metricsServerMap,
  clusterNodesRegistry,
  resolveCollectorKey,
  __test__,
} = await import("../metrics-orchestrator")

const NODE_ID = "valkey-6-valkey-headless-valkey-svc-cluster-local-6379"
const URI = "http://10.42.0.32:3000"
const SHARED_KEY = "k8s-shared-secret"

const makeRes = () => {
  const captured: { statusCode: number; body?: unknown } = { statusCode: 200 }
  const res = {
    status(code: number) { captured.statusCode = code; return res },
    send(body?: unknown) { captured.body = body; return res },
    sendStatus(code: number) { captured.statusCode = code; return res },
  }
  return { res: res as unknown as Response, captured }
}

const makeReq = (body: unknown, credential?: string) => ({
  body,
  headers: credential === undefined ? {} : { [ORCHESTRATOR_AUTH_HEADER]: credential },
}) as unknown as Request

const signRegister = (fields: { nodeId?: string; metricsServerUri?: string; timestamp?: number } = {}, key = SHARED_KEY) =>
  createOrchestratorAuthCredential(key, ORCHESTRATOR_AUTH_DOMAIN.REGISTER, {
    nodeId: NODE_ID,
    metricsServerUri: URI,
    timestamp: Date.now(),
    ...fields,
  }) as string

// Register a node into the discovered topology so it is a known cluster member.
const seedTopology = (nodeId = NODE_ID) => {
  clusterNodesRegistry.set("cluster-1", {
    [nodeId]: { host: "10.42.0.32", port: 6379, tls: false, verifyTlsCertificate: false },
  })
}

describe("K8s shared-key registration", () => {
  afterEach(() => {
    metricsServerMap.clear()
    clusterNodesRegistry.clear()
    __test__.collectorKeys.clear()
  })

  describe("resolveCollectorKey", () => {
    it("falls back to the shared ORCHESTRATOR_KEY for a node the orchestrator never spawned", () => {
      assert.strictEqual(resolveCollectorKey("never-spawned-node"), SHARED_KEY)
    })

    it("still prefers a per-node minted key when one exists", () => {
      __test__.collectorKeys.set("spawned-node", "per-node-key")
      assert.strictEqual(resolveCollectorKey("spawned-node"), "per-node-key")
    })
  })

  describe("handleRegister topology-membership gate", () => {
    it("admits a correctly signed sidecar for a known cluster node with no pre-existing entry", () => {
      seedTopology()
      assert.strictEqual(metricsServerMap.has(NODE_ID), false, "precondition: no orchestrator-spawned entry")

      const { res, captured } = makeRes()
      __test__.handleRegister(makeReq({ nodeId: NODE_ID, metricsServerUri: URI, timestamp: Date.now() }, signRegister()), res)

      assert.strictEqual(captured.statusCode, 200, "a known cluster node should be allowed to register")
      assert.strictEqual(metricsServerMap.get(NODE_ID)?.metricsURI, URI, "the sidecar's entry should be created on first register")
    })

    it("rejects a correctly signed sidecar whose nodeId is not in the discovered topology", () => {
      // Topology known, but for a different node.
      seedTopology("some-other-node-6379")

      const { res, captured } = makeRes()
      __test__.handleRegister(makeReq({ nodeId: NODE_ID, metricsServerUri: URI, timestamp: Date.now() }, signRegister()), res)

      assert.strictEqual(captured.statusCode, 401, "an unknown node must be rejected even with a valid signature")
      assert.strictEqual(metricsServerMap.has(NODE_ID), false)
    })

    it("rejects a known cluster node when the signature uses the wrong key", () => {
      seedTopology()

      const { res, captured } = makeRes()
      __test__.handleRegister(
        makeReq({ nodeId: NODE_ID, metricsServerUri: URI, timestamp: Date.now() }, signRegister({}, "wrong-key")),
        res,
      )

      assert.strictEqual(captured.statusCode, 401, "a bad signature must be rejected before the membership check")
      assert.strictEqual(metricsServerMap.has(NODE_ID), false)
    })
  })
})
