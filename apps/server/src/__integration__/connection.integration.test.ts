import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { sanitizeUrl, VALKEY } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultConnectionDetails, WS_URL } from "./harness/fixture"

describe("integration / connection", async () => {
  const ws = await WsClient.connect(WS_URL)
  after(async () => {
    await ws.close()
  })

  it("connects to the seed node and receives clusterConnectFulfilled", async () => {
    const connectionDetails = defaultConnectionDetails()
    const connectionId = sanitizeUrl(`${connectionDetails.host}-${connectionDetails.port}`)

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
