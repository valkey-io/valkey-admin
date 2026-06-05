import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { buildConnectionId, VALKEY } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import {
  defaultConnectionDetails,
  defaultStandaloneConnectionDetails,
  WS_URL
} from "./harness/fixture"

describe("integration / connection", async () => {
  const ws = await WsClient.connect(WS_URL)
  after(async () => {
    await ws.close()
  })

  it("connects to the seed node and receives clusterConnectFulfilled", async () => {
    const connectionDetails = defaultConnectionDetails()
    const connectionId = buildConnectionId(connectionDetails.host, connectionDetails.port, 0)

    ws.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: {
        connectionId,
        connectionDetails,
      },
    })

    const msg = await ws.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)

    assert.equal(msg.payload?.connectionId, connectionId, "payload.connectionId must echo the request")
    assert.ok(msg.payload?.connectionDetails?.clusterId, "clusterId must be present")
    assert.equal(typeof msg.payload.connectionDetails.clusterId, "string")
    assert.equal(msg.payload.address?.host, "valkey-7001")
    assert.equal(msg.payload.address?.port, 7001)
  })
})

/**
 * Two standalone connections to the same `host:port` differing only in `db`
 * must be tracked as independent clients and isolate their key spaces.
 */
describe("integration / connection / standalone two databases", async () => {
  const ws = await WsClient.connect(WS_URL)

  const detailsDb0 = defaultStandaloneConnectionDetails(0)
  const detailsDb1 = defaultStandaloneConnectionDetails(1)
  const connectionIdDb0 = buildConnectionId(detailsDb0.host, detailsDb0.port, 0)
  const connectionIdDb1 = buildConnectionId(detailsDb1.host, detailsDb1.port, 1)

  const runId = randomUUID()
  const keyDb0 = `it:db0:${runId}`
  const keyDb1 = `it:db1:${runId}`

  after(async () => {
    // Best-effort cleanup of the two test keys, one per connection.
    try {
      ws.send({
        type: VALKEY.KEYS.deleteKeyRequested,
        payload: { connectionId: connectionIdDb0, key: keyDb0 },
      })
      await ws.waitFor(VALKEY.KEYS.deleteKeyFulfilled, 10000)
    } catch {
      // ignore cleanup failures
    }
    try {
      ws.send({
        type: VALKEY.KEYS.deleteKeyRequested,
        payload: { connectionId: connectionIdDb1, key: keyDb1 },
      })
      await ws.waitFor(VALKEY.KEYS.deleteKeyFulfilled, 10000)
    } catch {
      // ignore cleanup failures
    }
    await ws.close()
  })

  it(
    "opens a separate client per (host, port, db) and isolates each db's keyspace",
    async () => {
      ws.send({
        type: VALKEY.CONNECTION.connectPending,
        payload: { connectionId: connectionIdDb0, connectionDetails: detailsDb0 },
      })
      const fulfilledDb0 = await ws.waitFor(
        VALKEY.CONNECTION.standaloneConnectFulfilled,
        30000,
      )
      assert.equal(
        fulfilledDb0.payload?.connectionId,
        connectionIdDb0,
        "db 0 connection should fulfill with buildConnectionId(host, port, 0)",
      )

      ws.send({
        type: VALKEY.CONNECTION.connectPending,
        payload: { connectionId: connectionIdDb1, connectionDetails: detailsDb1 },
      })
      const fulfilledDb1 = await ws.waitFor(
        VALKEY.CONNECTION.standaloneConnectFulfilled,
        30000,
      )
      assert.equal(
        fulfilledDb1.payload?.connectionId,
        connectionIdDb1,
        "db 1 connection should fulfill with buildConnectionId(host, port, 1)",
      )

      assert.notEqual(
        connectionIdDb0,
        connectionIdDb1,
        "connectionIds for db 0 and db 1 must differ",
      )

      ws.send({
        type: VALKEY.KEYS.addKeyRequested,
        payload: {
          connectionId: connectionIdDb0,
          key: keyDb0,
          keyType: "string",
          value: "from-db0",
        },
      })
      const addDb0 = await ws.waitFor(VALKEY.KEYS.addKeyFulfilled, 10000)
      assert.equal(addDb0.payload?.connectionId, connectionIdDb0)
      assert.equal(addDb0.payload?.key?.name, keyDb0)

      ws.send({
        type: VALKEY.KEYS.addKeyRequested,
        payload: {
          connectionId: connectionIdDb1,
          key: keyDb1,
          keyType: "string",
          value: "from-db1",
        },
      })
      const addDb1 = await ws.waitFor(VALKEY.KEYS.addKeyFulfilled, 10000)
      assert.equal(addDb1.payload?.connectionId, connectionIdDb1)
      assert.equal(addDb1.payload?.key?.name, keyDb1)

      // Scope SCAN to this run's unique prefix. We can't use FLUSHDB to wipe
      // each database (it's in BLOCKED_COMMANDS) and the keys are already
      // tagged with `randomUUID()`, so a prefixed pattern is sufficient to
      // assert per-`db` keyspace isolation without touching pre-existing keys.
      const scanPattern = `it:db*:${runId}`

      ws.send({
        type: VALKEY.KEYS.getKeysRequested,
        payload: { connectionId: connectionIdDb0, pattern: scanPattern, count: 100 },
      })
      const scanDb0 = await ws.waitFor(VALKEY.KEYS.getKeysFulfilled, 15000)
      assert.equal(scanDb0.payload?.connectionId, connectionIdDb0)
      const namesDb0 = (scanDb0.payload?.keys ?? []).map(
        (k: { name: string }) => k.name,
      )
      assert.deepEqual(
        [...namesDb0].sort(),
        [keyDb0],
        `db 0 scan should return only ${keyDb0}, got: ${namesDb0.join(", ")}`,
      )

      ws.send({
        type: VALKEY.KEYS.getKeysRequested,
        payload: { connectionId: connectionIdDb1, pattern: scanPattern, count: 100 },
      })
      const scanDb1 = await ws.waitFor(VALKEY.KEYS.getKeysFulfilled, 15000)
      assert.equal(scanDb1.payload?.connectionId, connectionIdDb1)
      const namesDb1 = (scanDb1.payload?.keys ?? []).map(
        (k: { name: string }) => k.name,
      )
      assert.deepEqual(
        [...namesDb1].sort(),
        [keyDb1],
        `db 1 scan should return only ${keyDb1}, got: ${namesDb1.join(", ")}`,
      )
    },
  )
})
