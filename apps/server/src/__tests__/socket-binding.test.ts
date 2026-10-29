/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert"
import { GlideClient } from "@valkey/valkey-glide"
import { CONNECTION_TEARDOWN_DELAY_MS, VALKEY } from "valkey-common"
import {
  bindConnection,
  createSocketBinding,
  resolveAction,
  scheduleRelease,
  unbindConnection
} from "../socket-binding"
import { createOwnerState, getEnvOwnerState, type OwnerState } from "../owner"
import { teardownConnection } from "../connection"
import { CONNECTION_ID_MISMATCH_MESSAGE, connectPending } from "../actions/connection"
import { scopedId, subscribe, unsubscribe, _reset as resetNodeWatchers } from "../node-watchers"

const fakeClient = () => ({ close: mock.fn() }) as any

const action = (type: string, payload: Record<string, unknown>) => ({ type, payload }) as any

describe("resolveAction", () => {
  let alice: OwnerState
  const lookup = (key: string) => (key === alice.ownerKey ? alice : undefined)

  beforeEach(() => {
    alice = createOwnerState("password~alice")
    alice.clients.set("h-7001-db0", { client: fakeClient(), clusterId: "cluster-1" })
    alice.clients.set("h-6379-db0", { client: fakeClient() })
  })

  it("rejects a connectionId this socket did not bind", () => {
    const binding = createSocketBinding()
    const result = resolveAction(binding, action(VALKEY.COMMAND.sendRequested, { connectionId: "h-6379-db0" }), lookup)
    assert.strictEqual(result.ok, false)
  })

  it("accepts a bound connectionId and returns that owner's state", () => {
    const binding = createSocketBinding()
    bindConnection(binding, alice.ownerKey, "h-6379-db0")
    const result = resolveAction(binding, action(VALKEY.COMMAND.sendRequested, { connectionId: "h-6379-db0" }), lookup)
    assert.ok(result.ok)
    assert.strictEqual(result.ownerKey, alice.ownerKey)
    assert.strictEqual(result.state, alice)
  })

  it("accepts the db-less nodeId of a bound connection with its own clusterId", () => {
    const binding = createSocketBinding()
    bindConnection(binding, alice.ownerKey, "h-7001-db0")
    const result = resolveAction(
      binding,
      action(VALKEY.MONITOR.monitorRequested, { connectionId: "h-7001", clusterId: "cluster-1" }),
      lookup,
    )
    assert.ok(result.ok)
  })

  it("rejects a clusterId that is not the cluster of the bound connection", () => {
    const binding = createSocketBinding()
    bindConnection(binding, alice.ownerKey, "h-6379-db0")
    const result = resolveAction(
      binding,
      action(VALKEY.COMMANDLOGS.commandLogsRequested, { connectionId: "h-6379-db0", clusterId: "cluster-1" }),
      lookup,
    )
    assert.strictEqual(result.ok, false)
  })

  it("rejects a clusterId with no connectionId", () => {
    const binding = createSocketBinding()
    bindConnection(binding, alice.ownerKey, "h-7001-db0")
    const result = resolveAction(binding, action(VALKEY.COMMANDLOGS.commandLogsRequested, { clusterId: "cluster-1" }), lookup)
    assert.strictEqual(result.ok, false)
  })

  it("treats an empty clusterId as absent", () => {
    const binding = createSocketBinding()
    bindConnection(binding, alice.ownerKey, "h-6379-db0")
    const result = resolveAction(
      binding,
      action(VALKEY.COMMANDLOGS.commandLogsRequested, { connectionId: "h-6379-db0", clusterId: "" }),
      lookup,
    )
    assert.ok(result.ok)
  })

  // The owner depends on the endpoint the AUTH probe succeeds against, so it is
  // picked by connectPending after the probe, not here.
  it("passes a connect through with no owner", () => {
    const binding = createSocketBinding()
    const result = resolveAction(
      binding,
      action(VALKEY.CONNECTION.connectPending, {
        connectionId: "h-6379-db0",
        connectionDetails: { host: "h", port: "6379", username: "bob", password: "pw" },
      }),
    )
    assert.ok(result.ok)
    assert.strictEqual(result.connect, true)
    assert.strictEqual(result.ownerKey, undefined)
    assert.strictEqual(result.state, undefined)
  })

  it("rejects a connect without connection details", () => {
    const result = resolveAction(createSocketBinding(), action(VALKEY.CONNECTION.connectPending, { connectionId: "x" }))
    assert.strictEqual(result.ok, false)
  })

  it("forgets a connection after unbind", () => {
    const binding = createSocketBinding()
    bindConnection(binding, alice.ownerKey, "h-6379-db0")
    unbindConnection(binding, "h-6379-db0")
    const result = resolveAction(binding, action(VALKEY.COMMAND.sendRequested, { connectionId: "h-6379-db0" }), lookup)
    assert.strictEqual(result.ok, false)
  })

  it("returns the previous owner when a socket rebinds a connectionId as another user", () => {
    const binding = createSocketBinding()
    assert.strictEqual(bindConnection(binding, "password~alice", "h-6379-db0"), undefined)
    assert.strictEqual(bindConnection(binding, "password~bob", "h-6379-db0"), "password~alice")
  })
})

describe("connectPending resume", () => {
  it("asks for the password when a password connection resumes without one", async () => {
    const sent: any[] = []
    const ws = { send: (m: string) => sent.push(JSON.parse(m)) } as any
    const original = GlideClient.createClient
    const createClient = mock.fn(async () => { throw new Error("must not connect") })
    GlideClient.createClient = createClient as any
    try {
      const state = createOwnerState("password~default")
      await connectPending({ ws, ownerKey: state.ownerKey, ownerState: state, binding: createSocketBinding() } as any)(
        action(VALKEY.CONNECTION.connectPending, {
          connectionId: "h-6379-db0",
          isResume: true,
          connectionDetails: { host: "h", port: "6379", username: "alice", tls: false, verifyTlsCertificate: false, db: 0 },
        }),
      )
      assert.strictEqual(createClient.mock.calls.length, 0)
      assert.strictEqual(sent.length, 1)
      assert.strictEqual(sent[0].type, VALKEY.CONNECTION.connectRejected)
      assert.strictEqual(sent[0].payload.requiresAuth, true)
    } finally {
      GlideClient.createClient = original
    }
  })
})

describe("connectPending id check", () => {
  // The server must not trust the client's connectionId. It must
  // name the endpoint the credentials are proven against, so a request that
  // pairs the victim's id with the attacker's host is refused before AUTH.
  const run = async (connectionId: string, host: string, port: string) => {
    const sent: any[] = []
    const ws = { send: (m: string) => sent.push(JSON.parse(m)) } as any
    const original = GlideClient.createClient
    const createClient = mock.fn(async () => { throw new Error("must not connect") })
    GlideClient.createClient = createClient as any
    try {
      await connectPending({ ws, binding: createSocketBinding() } as any)(
        action(VALKEY.CONNECTION.connectPending, {
          connectionId,
          connectionDetails: { host, port, username: "u", password: "pw", tls: false, verifyTlsCertificate: false, db: 0 },
        }),
      )
    } finally {
      GlideClient.createClient = original
    }
    return { sent, probes: createClient.mock.calls.length }
  }

  it("rejects a connectionId that names another endpoint, before the AUTH probe", async () => {
    const { sent, probes } = await run("10-0-0-5-6379-db0", "6.6.6.6", "6379")
    assert.strictEqual(probes, 0)
    assert.strictEqual(sent[0].type, VALKEY.CONNECTION.connectRejected)
    assert.strictEqual(sent[0].payload.errorMessage, CONNECTION_ID_MISMATCH_MESSAGE)
  })

  it("rejects a non-canonical port with the endpoint message", async () => {
    const { sent, probes } = await run("h-06379-db0", "h", "06379")
    assert.strictEqual(probes, 0)
    assert.match(sent[0].payload.errorMessage, /port/i)
  })

  it("accepts an id built from the normalized endpoint", async () => {
    // The probe runs (and fails here, by design of the mock), which shows the id check passed.
    const { sent, probes } = await run("cache-internal-6379-db0", " Cache.Internal. ", "6379")
    assert.strictEqual(probes, 1)
    assert.notStrictEqual(sent[0].payload.errorMessage, CONNECTION_ID_MISMATCH_MESSAGE)
  })
})

describe("release", () => {
  beforeEach(() => {
    resetNodeWatchers()
    mock.timers.enable({ apis: ["setTimeout"] })
  })
  afterEach(() => {
    mock.timers.reset()
    mock.restoreAll()
  })

  it("tears down a client after the delay when no socket binds it", () => {
    const state = createOwnerState("password~rel-a")
    const client = fakeClient()
    state.clients.set("h-6379-db0", { client })

    scheduleRelease(state, "h-6379-db0")
    mock.timers.tick(CONNECTION_TEARDOWN_DELAY_MS - 1)
    assert.strictEqual(client.close.mock.calls.length, 0)
    mock.timers.tick(1)
    assert.strictEqual(client.close.mock.calls.length, 1)
    assert.strictEqual(state.clients.has("h-6379-db0"), false)
  })

  it("keeps the client when a socket binds it again within the delay", () => {
    const state = createOwnerState("password~rel-b")
    const client = fakeClient()
    state.clients.set("h-6379-db0", { client })
    const ws = {} as any

    scheduleRelease(state, "h-6379-db0")
    subscribe(scopedId(state.ownerKey, "h-6379-db0"), ws)
    mock.timers.tick(CONNECTION_TEARDOWN_DELAY_MS)
    assert.strictEqual(client.close.mock.calls.length, 0)
    unsubscribe(scopedId(state.ownerKey, "h-6379-db0"), ws)
  })

  it("does not touch another owner's client on the same connectionId", () => {
    const a = createOwnerState("password~rel-c")
    const b = createOwnerState("password~rel-d")
    const clientA = fakeClient()
    const clientB = fakeClient()
    a.clients.set("h-6379-db0", { client: clientA })
    b.clients.set("h-6379-db0", { client: clientB })

    scheduleRelease(a, "h-6379-db0")
    mock.timers.tick(CONNECTION_TEARDOWN_DELAY_MS)
    assert.strictEqual(clientA.close.mock.calls.length, 1)
    assert.strictEqual(clientB.close.mock.calls.length, 0)
    assert.strictEqual(b.clients.has("h-6379-db0"), true)
  })
})

describe("teardown prunes an owner's collectors", () => {
  afterEach(() => mock.restoreAll())

  it("stops the cluster's collectors after the owner's last cluster connection, and keeps nodes still used", () => {
    const killed: number[] = []
    mock.method(process, "kill", (pid: number) => { killed.push(pid); return true })

    const state = createOwnerState("password~prune")
    const clusterClient = fakeClient()
    state.clients.set("a-6379-db0", { client: fakeClient() })
    state.clients.set("b-7001-db0", { client: clusterClient, clusterId: "c1" })
    state.clusterNodesRegistry.set("c1", {
      "b-7001": { host: "b", port: 7001, tls: false, verifyTlsCertificate: false },
      "c-7002": { host: "c", port: 7002, tls: false, verifyTlsCertificate: false },
    })
    state.clusterCredentials.set("c1", "pw")
    for (const [nodeId, pid] of [["a-6379", 1], ["b-7001", 2], ["c-7002", 3]] as const) {
      state.metricsServerMap.set(nodeId, { metricsURI: "", pid, lastSeen: 0 })
      state.collectorKeys.set(nodeId, `key-${pid}`)
    }

    teardownConnection(state, "b-7001-db0")

    assert.strictEqual(clusterClient.close.mock.calls.length, 1)
    assert.deepStrictEqual(killed.sort(), [2, 3])
    assert.deepStrictEqual([...state.metricsServerMap.keys()], ["a-6379"])
    assert.deepStrictEqual([...state.collectorKeys.keys()], ["a-6379"])
    assert.strictEqual(state.clusterNodesRegistry.has("c1"), false)
    assert.strictEqual(state.clusterCredentials.has("c1"), false)
  })

  it("does not prune the env owner's collectors", () => {
    const killed: number[] = []
    mock.method(process, "kill", (pid: number) => { killed.push(pid); return true })
    mock.method(globalThis, "fetch", async () => new Response("{}", { status: 500 }))
    mock.method(console, "warn", () => {})

    const env = getEnvOwnerState()
    env.clients.set("env-6379-db0", { client: fakeClient() })
    env.metricsServerMap.set("other-7000", { metricsURI: "http://127.0.0.1:1", pid: 9, lastSeen: 0 })
    try {
      teardownConnection(env, "env-6379-db0")
      assert.deepStrictEqual(killed, [])
      assert.strictEqual(env.metricsServerMap.has("other-7000"), true)
    } finally {
      env.metricsServerMap.clear()
      env.clients.clear()
    }
  })
})
