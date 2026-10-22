import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildConnectionId, COMMANDLOG_TYPE, MONITOR_ACTION, toNodeId, VALKEY } from "valkey-common"
import { WsClient, type InboundMessage } from "./harness/wsClient"
import {
  defaultConnectionDetails,
  defaultStandaloneConnectionDetails,
  RESTRICTED_USER,
  restrictedClusterConnectionDetails,
  standaloneConnectionDetailsAs,
  WS_URL
} from "./harness/fixture"

/**
 * Per-identity isolation (Phase 1 of discussion #580).
 *
 * Each WsClient is one browser socket. `admin` connects as `appuser` (all
 * commands). `limited` connects as `restricted` (no ACL, no COMMANDLOG). The
 * two users must never share a Valkey client or a metrics collector, and a
 * socket may act only on connections it opened itself.
 *
 * A rejected action produces no reply at all: the guard returns without
 * sending. So the absence of a reply within a window is the assertion.
 */
describe("integration / identity isolation", async () => {
  const admin = await WsClient.connect(WS_URL)
  const limited = await WsClient.connect(WS_URL)
  const stranger = await WsClient.connect(WS_URL)

  const clusterAdmin = defaultConnectionDetails()
  const clusterId0 = buildConnectionId(clusterAdmin.host, clusterAdmin.port, 0)
  const standaloneAdmin = standaloneConnectionDetailsAs({ username: "appuser", password: "admin" })
  const standaloneLimited = standaloneConnectionDetailsAs(RESTRICTED_USER)
  const standaloneId = buildConnectionId(standaloneAdmin.host, standaloneAdmin.port, 0)

  let clusterId: string | undefined

  const run = async (ws: WsClient, connectionId: string, command: string): Promise<InboundMessage> => {
    ws.send({ type: VALKEY.COMMAND.sendRequested, payload: { connectionId, command } })
    const reply = await Promise.race([
      ws.waitFor(VALKEY.COMMAND.sendFulfilled, 10000),
      ws.waitFor(VALKEY.COMMAND.sendFailed, 10000),
    ])
    return reply
  }

  const silentFor = async (ws: WsClient, types: string[], windowMs = 3000) => {
    const results = await Promise.all(types.map((type, i) => ws.collectFor(type, i === 0 ? windowMs : 100)))
    return results.reduce((n, r) => n + r.length, 0)
  }

  after(async () => {
    await admin.close()
    await limited.close()
    await stranger.close()
  })

  it("connects two Valkey users to the same cluster node and the same standalone node", async () => {
    admin.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId: clusterId0, connectionDetails: clusterAdmin } })
    const adminCluster = await admin.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)
    clusterId = adminCluster.payload?.connectionDetails?.clusterId
    assert.ok(clusterId)

    limited.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: { connectionId: clusterId0, connectionDetails: restrictedClusterConnectionDetails() },
    })
    await limited.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)

    admin.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId: standaloneId, connectionDetails: standaloneAdmin } })
    await admin.waitFor(VALKEY.CONNECTION.standaloneConnectFulfilled, 30000)
    limited.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId: standaloneId, connectionDetails: standaloneLimited } })
    await limited.waitFor(VALKEY.CONNECTION.standaloneConnectFulfilled, 30000)
  })

  it("runs each user's commands as that user (the reported ACL LIST bug)", async () => {
    for (const connectionId of [clusterId0, standaloneId]) {
      const adminWho = await run(admin, connectionId, "ACL WHOAMI")
      assert.equal(adminWho.payload, "appuser", `admin on ${connectionId}`)
      const limitedWho = await run(limited, connectionId, "ACL WHOAMI")
      assert.equal(limitedWho.type, VALKEY.COMMAND.sendFailed, "restricted has no ACL permission")
      assert.match(JSON.stringify(limitedWho.payload), /NOPERM|no permissions/i)
      assert.doesNotMatch(JSON.stringify(limitedWho.payload), /appuser/)

      const adminList = await run(admin, connectionId, "ACL LIST")
      assert.equal(adminList.type, VALKEY.COMMAND.sendFulfilled, `admin ACL LIST on ${connectionId}`)
    }
  })

  it("gives each user a metrics collector that runs as that user", async () => {
    // Collectors register a moment after connect; poll CLIENT LIST for both users.
    let users = new Set<string>()
    for (let attempt = 0; attempt < 30 && users.size < 2; attempt++) {
      const list = await run(admin, standaloneId, "CLIENT LIST")
      // The server parses `key:value` replies into an object; rebuild the lines.
      const text = typeof list.payload === "string"
        ? list.payload
        : Object.entries(list.payload ?? {}).map(([k, v]) => `${k}:${String(v)}`).join("\n")
      users = new Set(
        text
          .split("\n")
          .filter((line) => line.includes("valkey_admin_metrics"))
          .map((line) => / user=(\S+)/.exec(line)?.[1] ?? ""),
      )
      if (users.size < 2) await new Promise((r) => setTimeout(r, 1000))
    }
    assert.ok(users.has("appuser"), `appuser collector missing: ${[...users].join(",")}`)
    assert.ok(users.has(RESTRICTED_USER.username), `restricted collector missing: ${[...users].join(",")}`)
  })

  it("rejects a wrong password for an existing owner and keeps that owner's socket working", async () => {
    stranger.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: { connectionId: standaloneId, connectionDetails: { ...standaloneAdmin, password: "wrong" } },
    })
    const rejected = await stranger.waitFor(VALKEY.CONNECTION.connectRejected, 15000)
    assert.equal(rejected.payload?.connectionId, standaloneId)

    const stillWorks = await run(admin, standaloneId, "PING")
    assert.equal(stillWorks.payload, "PONG")
  })

  it("rejects actions on a connection the socket did not open", async () => {
    stranger.send({ type: VALKEY.COMMAND.sendRequested, payload: { connectionId: standaloneId, command: "PING" } })
    assert.equal(await silentFor(stranger, [VALKEY.COMMAND.sendFulfilled, VALKEY.COMMAND.sendFailed]), 0)
  })

  it("rejects a clusterId with no connectionId", async () => {
    assert.ok(clusterId)
    stranger.send({
      type: VALKEY.COMMANDLOGS.commandLogsRequested,
      payload: { clusterId, commandLogType: COMMANDLOG_TYPE.SLOW },
    })
    assert.equal(await silentFor(stranger, [VALKEY.COMMANDLOGS.commandLogsFulfilled, VALKEY.COMMANDLOGS.commandLogsError]), 0)
  })

  it("rejects a foreign clusterId paired with an owned connectionId", async () => {
    assert.ok(clusterId)
    const standaloneOnly = await WsClient.connect(WS_URL)
    try {
      const details = defaultStandaloneConnectionDetails(0)
      standaloneOnly.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId: standaloneId, connectionDetails: details } })
      await standaloneOnly.waitFor(VALKEY.CONNECTION.standaloneConnectFulfilled, 30000)
      standaloneOnly.send({
        type: VALKEY.COMMANDLOGS.commandLogsRequested,
        payload: { connectionId: standaloneId, clusterId, commandLogType: COMMANDLOG_TYPE.SLOW },
      })
      assert.equal(
        await silentFor(standaloneOnly, [VALKEY.COMMANDLOGS.commandLogsFulfilled, VALKEY.COMMANDLOGS.commandLogsError]),
        0,
      )
    } finally {
      await standaloneOnly.close()
    }
  })

  it("accepts a db-less nodeId with its own clusterId (monitor banner path)", async () => {
    assert.ok(clusterId)
    admin.send({
      type: VALKEY.MONITOR.monitorRequested,
      payload: { connectionId: toNodeId(clusterId0), clusterId, monitorAction: MONITOR_ACTION.STATUS },
    })
    const replies = await admin.collectFor(VALKEY.MONITOR.monitorFulfilled, 10000)
    assert.ok(replies.length >= 1, `expected at least one node to answer STATUS; got ${replies.length}`)
  })

  it("accepts an empty-string clusterId on a standalone connection", async () => {
    admin.send({
      type: VALKEY.COMMANDLOGS.commandLogsRequested,
      payload: { connectionId: standaloneId, clusterId: "", commandLogType: COMMANDLOG_TYPE.SLOW },
    })
    const fulfilled = await admin.collectFor(VALKEY.COMMANDLOGS.commandLogsFulfilled, 15000)
    const errored = await admin.collectFor(VALKEY.COMMANDLOGS.commandLogsError, 100)
    assert.ok(fulfilled.length + errored.length >= 1)
  })

  it("asks for the password when a password connection resumes without one", async () => {
    stranger.send({
      type: VALKEY.CONNECTION.connectPending,
      payload: {
        connectionId: standaloneId,
        connectionDetails: { ...standaloneAdmin, password: undefined },
        isResume: true,
      },
    })
    const rejected = await stranger.waitFor(VALKEY.CONNECTION.connectRejected, 10000)
    assert.equal(rejected.payload?.requiresAuth, true)
  })
})
