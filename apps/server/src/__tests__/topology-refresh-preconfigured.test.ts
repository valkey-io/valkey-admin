import { describe, it, afterEach, mock } from "node:test"
import assert from "node:assert"

// preConfiguredConnection is a module-load constant derived from VALKEY_HOST /
// VALKEY_PORT, so it must be set BEFORE importing the module to exercise the
// headless-refresh fallback (no live user client → initial client).
process.env.VALKEY_HOST = "valkey-0.example"
process.env.VALKEY_PORT = "6379"

const { resolveClusterRefreshTarget, initialConnectionDetails, __test__ } = await import("../metrics-orchestrator")

describe("resolveClusterRefreshTarget (preconfigured / headless)", () => {
  afterEach(() => mock.restoreAll())

  it("falls back to the initial client and initialConnectionDetails when there is no user client", async () => {
    const initialClient = { id: "initial-client" } as never
    mock.method(__test__, "getInitialClient", async () => initialClient)

    const target = await resolveClusterRefreshTarget(
      { node1: { host: "10.0.0.1", port: 6379, tls: false, verifyTlsCertificate: false } },
      undefined,
    )

    assert.strictEqual(target?.client, initialClient, "headless refresh should use the orchestrator's initial client")
    assert.strictEqual(
      target?.nodeInfo,
      initialConnectionDetails,
      "headless refresh decorates with initialConnectionDetails, the authoritative preconfigured config",
    )
  })

  it("still prefers a user client over the initial client when one is present", async () => {
    const userClient = { id: "user-client" } as never
    const initialClient = { id: "initial-client" } as never
    mock.method(__test__, "getInitialClient", async () => initialClient)

    const clusterNodes = { node1: { host: "10.0.0.1", port: 6379, tls: true, verifyTlsCertificate: false } }
    const target = await resolveClusterRefreshTarget(clusterNodes, userClient)

    assert.strictEqual(target?.client, userClient)
    assert.deepStrictEqual(target?.nodeInfo, clusterNodes.node1)
  })
})
