import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { sanitizeUrl, VALKEY } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultConnectionDetails, WS_URL } from "./harness/fixture"

describe("integration / send command", async () => {
  const ws = await WsClient.connect(WS_URL)

  after(async () => {
    await ws.close()
  })

  it("PING returns PONG via sendFulfilled", async () => {
    const connectionDetails = defaultConnectionDetails()
    const connectionId = sanitizeUrl(`${connectionDetails.host}-${connectionDetails.port}`)

    ws.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: {
        connectionId,
        connectionDetails: defaultConnectionDetails(),
      },
    })
    await ws.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)

    ws.send({
      type: VALKEY.COMMAND.sendRequested,
      payload: {
        connectionId,
        command: "PING",
      },
    })

    const msg = await ws.waitFor(VALKEY.COMMAND.sendFulfilled, 10000)

    assert.equal(msg.payload, "PONG", "server should return PONG for PING")
    assert.equal(msg.meta?.connectionId, connectionId)
    assert.equal(msg.meta?.command, "PING")
  })
})
