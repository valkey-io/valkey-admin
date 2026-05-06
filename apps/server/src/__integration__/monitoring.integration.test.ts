import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { VALKEY, MONITOR_ACTION, sanitizeUrl } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultConnectionDetails, WS_URL } from "./harness/fixture"

/**
 * The server silently filters the MONITOR fan-out against `metricsServerMap`
 * so the number of responses equals the number of currently-registered
 * metrics servers, not the cluster's node count.
 */
describe("integration / monitoring (cluster fan-out)", async () => {
  const ws = await WsClient.connect(WS_URL)
  const connectionDetails = defaultConnectionDetails()
  const connectionId = sanitizeUrl(`${connectionDetails.host}-${connectionDetails.port}`)
  let clusterId: string | undefined

  after(async () => {
    ws.send({
      type: VALKEY.MONITOR.monitorRequested,
      payload: { connectionId, clusterId, monitorAction: MONITOR_ACTION.STOP },
    })
    await ws.close()
  })

  it("fans out MONITOR start/stop to registered cluster nodes", async () => {
    const discoveryId = `discovery-${connectionId}`
    ws.send({
      type: VALKEY.TOPOLOGY.discoveryEndpointPending,
      payload: { discoveryId, connectionDetails },
    })
    const topoMsg = await ws.waitFor(VALKEY.TOPOLOGY.discoveryEndpointFulfilled, 30000)
    const nodeCount = Object.keys(topoMsg.payload?.clusterNodes ?? {}).length
    assert.ok(nodeCount >= 2, `cluster should have at least 2 primaries, got ${nodeCount}`)

    ws.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: { connectionId, connectionDetails },
    })
    const connectMsg = await ws.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)
    clusterId = connectMsg.payload?.connectionDetails?.clusterId as string
    assert.ok(clusterId, "clusterId must be present after cluster connect")

    ws.send({
      type: VALKEY.MONITOR.monitorRequested,
      payload: { connectionId, clusterId, monitorAction: MONITOR_ACTION.START },
    })
    const startResponses = await ws.collectFor(
      VALKEY.MONITOR.monitorFulfilled,
      5000,
    )
    assert.ok(
      startResponses.length >= 1,
      `expected at least one node to respond to START; got ${startResponses.length}`,
    )
    for (const r of startResponses) {
      assert.equal(
        r.payload?.parsedResponse?.monitorRunning,
        true,
        `expected monitorRunning=true for node ${String(r.payload?.connectionId)}`,
      )
    }

    ws.send({
      type: VALKEY.MONITOR.monitorRequested,
      payload: { connectionId, clusterId, monitorAction: MONITOR_ACTION.STOP },
    })
    const stopResponses = await ws.collectFor(
      VALKEY.MONITOR.monitorFulfilled,
      5000,
    )
    assert.ok(
      stopResponses.length >= 1,
      `expected at least one node to respond to STOP; got ${stopResponses.length}`,
    )
    for (const r of stopResponses) {
      assert.equal(
        r.payload?.parsedResponse?.monitorRunning,
        false,
        `expected monitorRunning=false for node ${String(r.payload?.connectionId)}`,
      )
    }
  })
})
