import { describe, it, afterEach, mock } from "node:test"
import assert from "node:assert"

// preConfiguredConnection is a module-load constant derived from VALKEY_HOST /
// VALKEY_PORT, so it must be set BEFORE importing the module to exercise the
// headless-refresh fallback (no live user client → initial client).
process.env.VALKEY_HOST = "valkey-0.example"
process.env.VALKEY_PORT = "6379"

const {
  resolveClusterRefreshTarget,
  setPreconfiguredClusterId,
  initialConnectionDetails,
  __test__,
} = await import("../metrics-orchestrator")

const PRECONFIGURED_ID = "preconfigured-cluster"

describe("resolveClusterRefreshTarget (preconfigured / headless)", () => {
  afterEach(() => {
    mock.restoreAll()
    setPreconfiguredClusterId(undefined)
  })

  it("refreshes the preconfigured cluster via the initial client + initialConnectionDetails", async () => {
    setPreconfiguredClusterId(PRECONFIGURED_ID)
    const initialClient = { id: "initial-client" } as never
    mock.method(__test__, "getInitialClient", async () => initialClient)

    const target = await resolveClusterRefreshTarget(
      PRECONFIGURED_ID,
      { node1: { host: "10.0.0.1", port: 6379, tls: false, verifyTlsCertificate: false } },
      undefined,
    )

    assert.strictEqual(target?.client, initialClient, "the preconfigured cluster should refresh via the initial client")
    assert.strictEqual(
      target?.nodeInfo,
      initialConnectionDetails,
      "the preconfigured cluster decorates with initialConnectionDetails",
    )
  })

  it("does NOT use the initial client for a different client-less cluster", async () => {
    // Preconfigured cluster is A; refreshing a stale, client-less cluster B must
    // not rediscover A's topology through the initial client.
    setPreconfiguredClusterId(PRECONFIGURED_ID)
    const getInitial = mock.method(__test__, "getInitialClient", async () => ({ id: "initial-client" } as never))

    const target = await resolveClusterRefreshTarget(
      "some-other-cluster",
      { node1: { host: "10.9.9.9", port: 6379, tls: false, verifyTlsCertificate: false } },
      undefined,
    )

    assert.strictEqual(target, undefined, "an unrelated client-less cluster must be left unchanged")
    assert.strictEqual(getInitial.mock.callCount(), 0, "the initial client must not be consulted for other clusters")
  })

  it("still prefers a user client over the initial client when one is present", async () => {
    const userClient = { id: "user-client" } as never
    mock.method(__test__, "getInitialClient", async () => ({ id: "initial-client" } as never))

    const clusterNodes = { node1: { host: "10.0.0.1", port: 6379, tls: true, verifyTlsCertificate: false } }
    const target = await resolveClusterRefreshTarget("any-cluster", clusterNodes, userClient)

    assert.strictEqual(target?.client, userClient)
    assert.deepStrictEqual(target?.nodeInfo, clusterNodes.node1)
  })
})
