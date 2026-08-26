import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildConnectionId, toNodeId, COMMANDLOG_TYPE, MONITOR_ACTION, VALKEY } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import {
  defaultConnectionDetails,
  defaultStandaloneConnectionDetails,
  WS_URL
} from "./harness/fixture"

/**
 * Session ownership of cluster-scoped actions.
 *
 * Two WsClients are two sessions: the harness sends no cookie, so each upgrade
 * mints a fresh `vk_sid`. `owner` connects to the cluster; `other` connects only
 * to the standalone node, so it never earns the cluster.
 *
 * A rejected action produces no reply at all — the guard returns without
 * sending. Absence within a window is therefore the assertion. The allow cases
 * below exercise the same code path and reply well inside it.
 */
describe("integration / session authorization (cluster scope)", async () => {
  const owner = await WsClient.connect(WS_URL)
  const other = await WsClient.connect(WS_URL)

  const clusterDetails = defaultConnectionDetails()
  const clusterConnectionId = buildConnectionId(clusterDetails.host, clusterDetails.port, 0)
  const standaloneDetails = defaultStandaloneConnectionDetails(0)
  const standaloneConnectionId = buildConnectionId(standaloneDetails.host, standaloneDetails.port, 0)

  let clusterId: string | undefined

  after(async () => {
    await owner.close()
    await other.close()
  })

  it("establishes one cluster session and one unrelated standalone session", async () => {
    owner.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: { connectionId: clusterConnectionId, connectionDetails: clusterDetails },
    })
    const connected = await owner.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)
    clusterId = connected.payload?.connectionDetails?.clusterId as string
    assert.ok(clusterId, "clusterId must be present after cluster connect")

    other.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: { connectionId: standaloneConnectionId, connectionDetails: standaloneDetails },
    })
    const standalone = await other.waitFor(VALKEY.CONNECTION.standaloneConnectFulfilled, 30000)
    assert.equal(standalone.payload?.connectionId, standaloneConnectionId)
  })

  it("rejects a clusterId with no connectionId to derive ownership from", async () => {
    assert.ok(clusterId, "setup must have run")
    other.send({
      type: VALKEY.COMMANDLOGS.commandLogsRequested,
      payload: { clusterId, commandLogType: COMMANDLOG_TYPE.SLOW },
    })

    const fulfilled = await other.collectFor(VALKEY.COMMANDLOGS.commandLogsFulfilled, 3000)
    const errored = await other.collectFor(VALKEY.COMMANDLOGS.commandLogsError, 100)
    assert.equal(
      fulfilled.length + errored.length,
      0,
      "a clusterId-only payload must be rejected before the handler runs",
    )
  })

  it("rejects a foreign clusterId paired with an owned connectionId", async () => {
    assert.ok(clusterId, "setup must have run")
    other.send({
      type: VALKEY.COMMANDLOGS.commandLogsRequested,
      payload: {
        connectionId: standaloneConnectionId, // owned by this session
        clusterId,                            // but belongs to the other session's cluster
        commandLogType: COMMANDLOG_TYPE.SLOW,
      },
    })

    const fulfilled = await other.collectFor(VALKEY.COMMANDLOGS.commandLogsFulfilled, 3000)
    const errored = await other.collectFor(VALKEY.COMMANDLOGS.commandLogsError, 100)
    assert.equal(
      fulfilled.length + errored.length,
      0,
      "an owned connectionId must not authorize a cluster it does not belong to",
    )
  })

  it("allows a db-less nodeId paired with its own clusterId (monitor banner path)", async () => {
    assert.ok(clusterId, "setup must have run")
    // The monitor banner names the node, not the connection: it sends the
    // db-less nodeId in the `connectionId` field.
    owner.send({
      type: VALKEY.MONITOR.monitorRequested,
      payload: {
        connectionId: toNodeId(clusterConnectionId),
        clusterId,
        monitorAction: MONITOR_ACTION.STATUS,
      },
    })

    const replies = await owner.collectFor(VALKEY.MONITOR.monitorFulfilled, 10000)
    assert.ok(replies.length >= 1, `expected at least one node to answer STATUS; got ${replies.length}`)
  })

  it("allows an empty-string clusterId on a standalone connection", async () => {
    // The metrics-retry epic sends `clusterId: details?.clusterId ?? ""`, so a
    // standalone connection puts "" on the wire. The guard must treat that as
    // absent — tightening it to `!== undefined` would reject every standalone
    // metrics refresh.
    other.send({
      type: VALKEY.MONITOR.monitorRequested,
      payload: {
        connectionId: standaloneConnectionId,
        clusterId: "",
        monitorAction: MONITOR_ACTION.STATUS,
      },
    })

    const fulfilled = await other.collectFor(VALKEY.MONITOR.monitorFulfilled, 10000)
    const errored = await other.collectFor(VALKEY.MONITOR.monitorError, 100)
    assert.ok(
      fulfilled.length + errored.length >= 1,
      "an empty-string clusterId must not be treated as a cluster claim",
    )
  })

  it("keeps the socket usable after a rejection", async () => {
    // The guard returns; it must not close the connection.
    other.send({
      type: VALKEY.MONITOR.monitorRequested,
      payload: { connectionId: standaloneConnectionId, monitorAction: MONITOR_ACTION.STATUS },
    })
    const fulfilled = await other.collectFor(VALKEY.MONITOR.monitorFulfilled, 10000)
    const errored = await other.collectFor(VALKEY.MONITOR.monitorError, 100)
    assert.ok(fulfilled.length + errored.length >= 1, "session must still work after rejected actions")
  })
})
