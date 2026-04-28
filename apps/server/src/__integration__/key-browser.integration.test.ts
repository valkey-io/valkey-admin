import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { sanitizeUrl, VALKEY } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultConnectionDetails, WS_URL } from "./harness/fixture"

// Keys seeded by `tools/valkey-cluster/populate.mjs`.
const SEEDED_STRING_KEYS = ["string:1", "string:2", "string:3", "string:4", "string:5"] as const

describe("integration / key browser", async () => {
  const ws = await WsClient.connect(WS_URL)
  const connectionDetails = defaultConnectionDetails()
  const connectionId = sanitizeUrl(`${connectionDetails.host}-${connectionDetails.port}`)
  const testKey = `it:${randomUUID()}:roundtrip`

  after(async () => {
    // delete the test key if still present.
    if (ws && connectionId) {
      ws.send({
        type: VALKEY.KEYS.deleteKeyRequested,
        payload: { connectionId, key: testKey },
      })
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
})
