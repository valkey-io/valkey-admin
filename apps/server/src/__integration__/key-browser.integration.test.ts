import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { buildConnectionId, VALKEY } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultConnectionDetails, WS_URL } from "./harness/fixture"

// Keys seeded by `tools/valkey-cluster/populate.mjs` for database 0.
// Every database `d` carries the same shape under the `db<d>` tag
const SEEDED_STRING_KEYS = ["string:db0:1", "string:db0:2", "string:db0:3", "string:db0:4", "string:db0:5"] as const

describe("integration / key browser", async () => {
  const ws = await WsClient.connect(WS_URL)
  const connectionDetails = defaultConnectionDetails()
  const connectionId = buildConnectionId(connectionDetails.host, connectionDetails.port, 0)
  const testKey = `it:${randomUUID()}:roundtrip`
  const binaryHashKey = `it:${randomUUID()}:binary-hash`

  after(async () => {
    // delete the test keys if still present.
    if (ws && connectionId) {
      for (const key of [testKey, binaryHashKey]) {
        ws.send({
          type: VALKEY.KEYS.deleteKeyRequested,
          payload: { connectionId, key },
        })
      }
    }
    await ws.close()
  })

  it("scans seeded string keys and round-trips add/delete", async () => {
    ws.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: {
        connectionId,
        connectionDetails: defaultConnectionDetails(),
      },
    })
    await ws.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)

    // --- Scan: pattern string:* should return exactly the 5 seeded keys ---
    ws.send({
      type: VALKEY.KEYS.getKeysRequested,
      payload: { connectionId, pattern: "string:*", count: 100 },
    })

    const scanMsg = await ws.waitFor(VALKEY.KEYS.getKeysFulfilled, 15000)
    const scannedNames = new Set(
      (scanMsg.payload?.keys ?? []).map((k: { name: string }) => k.name),
    )
    for (const expected of SEEDED_STRING_KEYS) {
      assert.ok(scannedNames.has(expected), `expected seeded key '${expected}' in scan results, got: ${[...scannedNames].join(", ")}`)
    }

    // --- Round-trip: add, then delete a test key ---
    ws.send({
      type: VALKEY.KEYS.addKeyRequested,
      payload: {
        connectionId,
        key: testKey,
        keyType: "string",
        value: "hello",
      },
    })
    const addMsg = await ws.waitFor(VALKEY.KEYS.addKeyFulfilled, 10000)
    assert.equal(addMsg.payload?.key?.name, testKey)
    assert.equal(addMsg.payload?.key?.type?.toLowerCase(), "string")

    ws.send({
      type: VALKEY.KEYS.deleteKeyRequested,
      payload: { connectionId, key: testKey },
    })
    const delMsg = await ws.waitFor(VALKEY.KEYS.deleteKeyFulfilled, 10000)
    assert.equal(delMsg.payload?.key, testKey)
    assert.equal(delMsg.payload?.deleted, true, "deleted should be true for an existing key")
  })

  it("shows text fields of a hash that also holds binary fields", async () => {
    // WebSocket payloads are text, so the non-UTF-8 bytes are written from Lua.
    ws.send({
      type: VALKEY.COMMAND.sendRequested,
      payload: {
        connectionId,
        command: `EVAL "return redis.call('HSET', KEYS[1], 'name', 'alice', string.char(128, 129), 'x', 'blob', string.char(255))" 1 ${binaryHashKey}`,
      },
    })
    await ws.waitFor(VALKEY.COMMAND.sendFulfilled, 10000)

    ws.send({
      type: VALKEY.KEYS.getKeyTypeRequested,
      payload: { connectionId, key: binaryHashKey },
    })
    const keyMsg = await ws.waitFor(VALKEY.KEYS.getKeyTypeFulfilled, 10000)
    const elements = keyMsg.payload?.elements as { key: string; value: string }[]

    assert.equal(keyMsg.payload?.elementsWarning, undefined)
    assert.equal(keyMsg.payload?.collectionSize, 3)
    const byField = new Map(elements.map(({ key, value }, index) => [key, { value, index }]))
    assert.equal(byField.get("name")?.value, "alice")
    assert.equal(byField.get("\\x80\\x81")?.value, "x")
    assert.equal(byField.get("blob")?.value, "\\xff")
    assert.deepEqual(
      [...(keyMsg.payload?.binaryIndexes ?? [])].sort(),
      [byField.get("\\x80\\x81")?.index, byField.get("blob")?.index].sort(),
    )
  })
})
