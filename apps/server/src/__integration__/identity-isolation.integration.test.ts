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

  // `INFO server` arrives as one object on a standalone client and as a
  // per-node `[{ key, value }]` array on a cluster client.
  const tcpPorts = (payload: unknown): string[] =>
    Array.isArray(payload)
      ? payload.map((n: { value?: { tcp_port?: string } }) => String(n.value?.tcp_port))
      : [String((payload as { tcp_port?: string } | undefined)?.tcp_port)]

  // Finding 1. The victim (`admin`) is connected to the standalone node as
  // appuser. A second socket authenticates as appuser against another node
  // (the cluster seed) and names the victim's connectionId. Before the fix the
  // server handed over, or with isRetry replaced, the victim's client.
  it("does not hand a client to a socket that pairs the victim's connectionId with another host", async () => {
    const attacker = await WsClient.connect(WS_URL)
    try {
      for (const isRetry of [false, true]) {
        attacker.send({
          type: VALKEY.CONNECTION.connectPending,
          payload: {
            connectionId: standaloneId,
            connectionDetails: { ...clusterAdmin, endpointType: "node" },
            ...(isRetry && { isRetry }),
          },
        })
        const rejected = await attacker.waitFor(VALKEY.CONNECTION.connectRejected, 15000)
        assert.equal(rejected.payload?.connectionId, standaloneId, `isRetry=${isRetry}`)
        assert.match(rejected.payload?.errorMessage ?? "", /does not match/)

        // The attacker gets nothing on that id, and the victim's client still answers from its own node.
        attacker.send({ type: VALKEY.COMMAND.sendRequested, payload: { connectionId: standaloneId, command: "PING" } })
        assert.equal(await silentFor(attacker, [VALKEY.COMMAND.sendFulfilled, VALKEY.COMMAND.sendFailed]), 0)
        const info = await run(admin, standaloneId, "INFO server")
        assert.equal(tcpPorts(info.payload).join(","), "6379", `victim still on 6379 after isRetry=${isRetry}`)
      }

      // A well-formed connect to the other node works and runs on that node.
      attacker.send({
        type: VALKEY.CONNECTION.connectPending,
        payload: { connectionId: clusterId0, connectionDetails: clusterAdmin },
      })
      await attacker.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)
      const info = await run(attacker, clusterId0, "INFO server")
      assert.ok(tcpPorts(info.payload).includes("7001"), `cluster client answers from the cluster, got ${tcpPorts(info.payload)}`)
    } finally {
      await attacker.close()
    }
  })

  // Two node connects of one identity into one cluster share one owner, so the
  // second sees the collectors the first started. Checked within 3 s of the
  // second connect: the reconcile loop runs every 10 s, so a separate owner
  // could not have spawned its own collectors in that window.
  const assertSharesCollectors = async (
    ws: WsClient,
    user: { username: string; password: string },
    requestType: string,
    fulfilledType: string,
    payloadExtra: Record<string, unknown>,
  ) => {
    const first = defaultConnectionDetails()
    const firstId = buildConnectionId(first.host, first.port, 0)
    const second = { ...first, host: "valkey-7002", port: "7002" }
    const secondId = buildConnectionId(second.host, second.port, 0)
    ws.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId: firstId, connectionDetails: { ...first, ...user } } })
    const a = await ws.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)
    // Give the first owner's collectors time to register.
    await new Promise((r) => setTimeout(r, 8000))
    ws.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId: secondId, connectionDetails: { ...second, ...user } } })
    const b = await ws.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)
    const cid = a.payload?.connectionDetails?.clusterId
    assert.ok(cid)
    assert.equal(b.payload?.connectionDetails?.clusterId, cid)

    ws.send({ type: requestType, payload: { connectionId: secondId, clusterId: cid, ...payloadExtra } })
    const reply = await ws.waitFor(fulfilledType, 3000)
    const nodeErrors = reply.payload?.nodeErrors ?? []
    assert.deepEqual(nodeErrors, [], `no node may lack a collector: ${JSON.stringify(nodeErrors)}`)
    return [firstId, secondId]
  }

  it("joins the env owner when the same identity connects through a second cluster node", async () => {
    const ws = await WsClient.connect(WS_URL)
    const ids: string[] = []
    try {
      ids.push(...await assertSharesCollectors(
        ws, { username: "appuser", password: "admin" },
        VALKEY.COMMANDLOGS.commandLogsRequested, VALKEY.COMMANDLOGS.commandLogsFulfilled,
        { commandLogType: COMMANDLOG_TYPE.SLOW },
      ))
    } finally {
      for (const id of ids) ws.send({ type: VALKEY.CONNECTION.closeConnection, payload: { connectionId: id } })
      await ws.close()
    }
  })

  it("joins a non-env owner through the two-way rule when the same identity connects through a second node", async () => {
    const ws = await WsClient.connect(WS_URL)
    const ids: string[] = []
    try {
      ids.push(...await assertSharesCollectors(
        ws, RESTRICTED_USER,
        VALKEY.HOTKEYS.hotKeysRequested, VALKEY.HOTKEYS.hotKeysFulfilled,
        { count: 5 },
      ))
    } finally {
      for (const id of ids) ws.send({ type: VALKEY.CONNECTION.closeConnection, payload: { connectionId: id } })
      await ws.close()
    }
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
