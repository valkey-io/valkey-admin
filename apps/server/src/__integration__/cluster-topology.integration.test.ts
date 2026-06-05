import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { VALKEY, buildConnectionId } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultConnectionDetails, WS_URL } from "./harness/fixture"
import { parseVersionString, supportsClusterDb, type ServerVersion } from "../utils"

describe("integration / cluster topology", async () => {
  const ws = await WsClient.connect(WS_URL)
  after(async () => {
    await ws.close()
  })

  it("discovers 3 primaries each with 1 replica", async () => {
    const connectionDetails = defaultConnectionDetails()
    const discoveryId = `discovery-${buildConnectionId(connectionDetails.host, connectionDetails.port, 0)}`

    ws.send({
      type: VALKEY.TOPOLOGY.discoveryEndpointPending,
      payload: {
        discoveryId,
        connectionDetails,
      },
    })

    const msg = await ws.waitFor(VALKEY.TOPOLOGY.discoveryEndpointFulfilled, 30000)

    assert.equal(msg.payload?.discoveryId, discoveryId)
    const nodes = msg.payload?.clusterNodes as Record<string, {
      host: string
      port: number
      replicas: { id: string; host: string; port: number }[]
    }>
    assert.ok(nodes && typeof nodes === "object", "clusterNodes must be an object")

    const primaries = Object.values(nodes)
    assert.equal(primaries.length, 3, `expected 3 primaries, got ${primaries.length}`)

    for (const primary of primaries) {
      assert.equal(primary.replicas.length, 1, `primary ${primary.host}:${primary.port} should have 1 replica`)
      assert.ok(typeof primary.replicas[0].id === "string" && primary.replicas[0].id.length > 0)
      assert.ok(typeof primary.replicas[0].host === "string")
      assert.ok(typeof primary.replicas[0].port === "number")
    }
  })
})

describe("integration / cluster topology / cluster gating", async () => {
  const ws = await WsClient.connect(WS_URL)
  after(async () => {
    await ws.close()
  })

  it("honors Server_Version when gating non-zero db", async () => {
    const connectionDetails = defaultConnectionDetails()

    const db0ConnectionId = buildConnectionId(connectionDetails.host, connectionDetails.port, 0)
    ws.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: {
        connectionId: db0ConnectionId,
        connectionDetails,
      },
    })
    const db0Msg = await ws.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)
    assert.equal(db0Msg.payload?.connectionId, db0ConnectionId, "db: 0 cluster connect must echo the request id")
    assert.ok(db0ConnectionId.endsWith("-db0"), "db: 0 connectionId must encode the database index")

    ws.send({
      type: VALKEY.COMMAND.sendRequested,
      payload: {
        connectionId: db0ConnectionId,
        command: "INFO server",
      },
    })
    const infoMsg = await ws.waitFor(VALKEY.COMMAND.sendFulfilled, 10000)
    const version = extractServerVersion(infoMsg.payload)
    assert.ok(
      version,
      `expected redis_version or valkey_version in INFO server response, got: ${JSON.stringify(infoMsg.payload)}`,
    )

    const db1ConnectionId = buildConnectionId(connectionDetails.host, connectionDetails.port, 1)
    ws.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: {
        connectionId: db1ConnectionId,
        connectionDetails: { ...connectionDetails, db: 1 },
      },
    })

    if (supportsClusterDb(version)) {
      const db1Msg = await ws.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)
      assert.equal(
        db1Msg.payload?.connectionId,
        db1ConnectionId,
        `>= 9.0.0 cluster should accept db: 1; got connectionId=${db1Msg.payload?.connectionId}`,
      )
      assert.ok(db1ConnectionId.endsWith("-db1"), "db: 1 connectionId must encode the database index")
    } else {
      const rejectedMsg = await ws.waitFor(VALKEY.CONNECTION.connectRejected, 30000)
      assert.equal(
        rejectedMsg.payload?.connectionId,
        db1ConnectionId,
        "rejection payload must echo the requested connectionId",
      )
      const errorMessage = String(rejectedMsg.payload?.errorMessage ?? "")
      assert.match(
        errorMessage,
        /Cluster server version .* does not support a non-zero Database_Index/,
        `expected cluster-version gating error, got "${errorMessage}"`,
      )
    }
  })
})

function extractServerVersion(payload: unknown): ServerVersion | null {
  const fromRecord = (parsed: Record<string, string>): ServerVersion | null => {
    // Prefer `valkey_version` because Valkey servers also expose a legacy
    // `redis_version` (Redis-compat) field that would underreport the actual
    // server version for cluster gating.
    const versionString = parsed["valkey_version"] ?? parsed["redis_version"]
    return versionString ? parseVersionString(versionString) : null
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const value = (entry as { value?: unknown })?.value
      if (value && typeof value === "object") {
        const v = fromRecord(value as Record<string, string>)
        if (v) return v
      }
    }
    return null
  }
  if (payload && typeof payload === "object") {
    return fromRecord(payload as Record<string, string>)
  }
  return null
}
