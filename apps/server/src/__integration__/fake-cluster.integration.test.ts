import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { buildConnectionId, COMMANDLOG_TYPE, VALKEY } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultConnectionDetails, WS_URL } from "./harness/fixture"
import { startFakeClusterNode, type FakeSlotRange } from "./harness/fakeClusterNode"

/**
 * N1 from the security review. An attacker runs a server that accepts any
 * password and answers CLUSTER SLOTS with a victim's clusterId and node list.
 * Before the fix, a connect to that server as the victim's username landed in
 * the victim's owner state and overwrote its cluster registry and credentials.
 *
 * The fake node runs on the host. The server inside the compose stack reaches
 * it as `host.containers.internal` (set FAKE_NODE_HOST for other setups).
 */
const FAKE_NODE_HOST = process.env.FAKE_NODE_HOST ?? "host.containers.internal"

describe("integration / fake cluster node", async () => {
  const victim = await WsClient.connect(WS_URL)
  const attacker = await WsClient.connect(WS_URL)
  const details = defaultConnectionDetails()
  const victimId = buildConnectionId(details.host, details.port, 0)
  let clusterId: string
  let realNodes: Record<string, { host: string; port: number }>
  let fake: Awaited<ReturnType<typeof startFakeClusterNode>>

  const run = async (ws: WsClient, connectionId: string, command: string) => {
    ws.send({ type: VALKEY.COMMAND.sendRequested, payload: { connectionId, command } })
    return Promise.race([ws.waitFor(VALKEY.COMMAND.sendFulfilled, 10000), ws.waitFor(VALKEY.COMMAND.sendFailed, 10000)])
  }

  // The server turns a `key:value` reply into an object, so CLUSTER NODES
  // arrives as one entry per line, keyed by `<id> <ip>`. Count the lines.
  const realClusterNodeCount = async () => {
    const nodes = await run(victim, victimId, "CLUSTER NODES")
    const text = typeof nodes.payload === "string"
      ? nodes.payload
      : Object.entries(nodes.payload ?? {}).map(([k, v]) => `${k}:${String(v)}`).join("\n")
    return text.split("\n").filter((line) => line.includes("@")).length
  }

  before(async () => {
    victim.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId: victimId, connectionDetails: details } })
    const fulfilled = await victim.waitFor(VALKEY.CONNECTION.clusterConnectFulfilled, 30000)
    clusterId = fulfilled.payload.connectionDetails.clusterId
    const added = await victim.waitFor(VALKEY.CLUSTER.addCluster, 10000)
    realNodes = added.payload.clusterNodes

    // The fake node claims the victim's clusterId: its first primary's id is the
    // real one, and it lists the real primaries plus itself.
    const primaries = Object.values(realNodes)
    const slots: FakeSlotRange[] = primaries.map((n, i) => {
      const from = Math.floor((16384 / primaries.length) * i)
      const to = i === primaries.length - 1 ? 16383 : Math.floor((16384 / primaries.length) * (i + 1)) - 1
      // Node ids: the first primary keeps the real id so the clusterId matches.
      return [from, to, [n.host, Number(n.port), i === 0 ? clusterId : `fake-${i}`]]
    })
    fake = await startFakeClusterNode(slots)
    // Give the fake its own slot range so it appears in its own topology.
    slots.push([16383, 16383, [FAKE_NODE_HOST, fake.port, "fake-self"]])
    // Collectors register a moment after connect.
    await new Promise((r) => setTimeout(r, 8000))
  })

  after(async () => {
    victim.send({ type: VALKEY.CONNECTION.closeConnection, payload: { connectionId: victimId } })
    await victim.close()
    await attacker.close()
    await fake?.close()
  })

  it("the fake node reports the victim's clusterId", async () => {
    const fakeDetails = { ...details, host: FAKE_NODE_HOST, port: String(fake.port), password: "wrong-for-real-nodes" }
    const fakeId = buildConnectionId(fakeDetails.host, fakeDetails.port, 0)
    attacker.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId: fakeId, connectionDetails: fakeDetails } })
    // The fake accepts AUTH, so owner selection runs. The attacker's own owner
    // then tries to build a cluster client against the real nodes with a wrong
    // password, which fails. Either outcome is fine; isolation is what matters.
    // Poll both outcomes so no losing timer is left behind at exit.
    const deadline = Date.now() + 45000
    let outcome: unknown
    while (!outcome && Date.now() < deadline) {
      const [rejected, fulfilled] = await Promise.all([
        attacker.collectFor(VALKEY.CONNECTION.connectRejected, 1000),
        attacker.collectFor(VALKEY.CONNECTION.clusterConnectFulfilled, 100),
      ])
      outcome = rejected[0] ?? fulfilled[0]
    }
    assert.ok(outcome, "the attacker's connect settled")
    assert.ok(fake.seen.some((c) => c[0]?.toUpperCase() === "CLUSTER"), "the probe asked the fake node for CLUSTER SLOTS")
  })

  it("leaves the victim's registry, credentials and client untouched", async () => {
    const nodesBefore = Object.keys(realNodes).sort()
    victim.send({ type: VALKEY.CLUSTER.setClusterData, payload: { connectionId: victimId, clusterId } })
    const data = await victim.waitFor(VALKEY.CLUSTER.setClusterData, 15000)
    assert.deepEqual(Object.keys(data.payload.clusterNodes ?? {}).sort(), nodesBefore, "registry still lists the real nodes only")
    assert.ok(!JSON.stringify(data.payload.clusterNodes).includes(FAKE_NODE_HOST), "the fake host is not in the victim's registry")

    const who = await run(victim, victimId, "ACL WHOAMI")
    assert.equal(who.payload, "appuser")
    assert.equal(await realClusterNodeCount(), 6, "the victim's client still talks to the real cluster")

    victim.send({
      type: VALKEY.COMMANDLOGS.commandLogsRequested,
      payload: { connectionId: victimId, clusterId, commandLogType: COMMANDLOG_TYPE.SLOW },
    })
    const logs = await victim.waitFor(VALKEY.COMMANDLOGS.commandLogsFulfilled, 15000)
    assert.deepEqual(logs.payload.nodeErrors ?? [], [], "the victim's collectors are all still registered")
  })
})
