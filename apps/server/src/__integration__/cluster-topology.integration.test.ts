import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { VALKEY, sanitizeUrl } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultConnectionDetails, WS_URL } from "./harness/fixture"

describe("integration / cluster topology", async () => {
  const ws = await WsClient.connect(WS_URL)
  after(async () => {
    await ws.close()
  })

  it("discovers 3 primaries each with 1 replica", async () => {
    const connectionDetails = defaultConnectionDetails()
    const discoveryId = `discovery-${sanitizeUrl(`${connectionDetails.host}-${connectionDetails.port}`)}`

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
