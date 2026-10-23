/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert"
import { GlideClient } from "@valkey/valkey-glide"
import { CONNECTION_TEARDOWN_DELAY_MS, VALKEY } from "valkey-common"
import { connectedNodesFor, createSocketBinding, resolveAction, type SocketBinding } from "../socket-binding"
import { connectPending } from "../actions/connection"
import { allOwnerStates } from "../owner"
import { getWatcherCount, scopedId, subscribe, unsubscribe, unsubscribeAll, _reset as resetNodeWatchers } from "../node-watchers"
import { __test__ } from "../metrics-orchestrator"
import { _resetAuthLimiter } from "../auth-limiter"

/**
 * A browser socket can close while one of its connects is still running. The
 * close handler releases only the connections bound on the socket, and a
 * connect is bound only after it finishes. The connect must then release
 * what it created, or the client and its collector stay until restart.
 */

const CONNECTION_ID = "127-0-0-1-6379-db0"

const clientMock = () => ({
  info: async () => "cluster_enabled:0",
  customCommand: async () => [],
  configGet: async () => ({ databases: "16" }),
  close: mock.fn(),
})

const OPEN = 1
const CLOSED = 3
const makeWs = (): any => ({ send: () => {}, readyState: OPEN, OPEN })

// The same steps as ws.on("close") in index.ts, for a socket with no bound connections yet.
const closeSocket = (ws: any) => {
  ws.readyState = CLOSED
  unsubscribeAll(ws)
}

const startConnect = (ws: any, binding: SocketBinding, username: string) => {
  const action: any = {
    type: VALKEY.CONNECTION.connectPending,
    payload: {
      connectionId: CONNECTION_ID,
      connectionDetails: {
        host: "127.0.0.1", port: "6379", username, password: "pw",
        tls: false, verifyTlsCertificate: false, endpointType: "node", db: 0,
      },
    },
  }
  const resolved = resolveAction(binding, action) as any
  return connectPending({
    ws, ownerKey: resolved.ownerKey, ownerState: resolved.state, binding,
    connectedNodesByCluster: connectedNodesFor(binding, resolved.ownerKey),
  } as any)(action)
}

const findState = (username: string) => allOwnerStates().find((s) => s.ownerKey === `password~${username}`)

// Let pending promise callbacks run without moving the mocked clock.
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }

describe("socket closes while a connect is running", () => {
  let original: typeof GlideClient.createClient
  let killed: number[]
  // `gate(n)` holds the n-th createClient call (1 = AUTH probe, 2 = working client) until released.
  let held: Map<number, () => void>
  let calls: number
  let client: ReturnType<typeof clientMock>

  const gate = (n: number) => {
    let release!: () => void
    const wait = new Promise<void>((r) => { release = r })
    held.set(n, release)
    return wait
  }

  beforeEach(() => {
    _resetAuthLimiter()
    resetNodeWatchers()
    killed = []
    held = new Map()
    calls = 0
    client = clientMock()
    original = GlideClient.createClient
    for (const m of ["error", "warn", "log", "debug"] as const) mock.method(console, m, () => {})
    mock.method(process, "kill", (pid: number) => { killed.push(pid); return true })
    mock.method(__test__, "spawnProcess", () => ({ pid: 4242, stderr: null, on: () => undefined }))
    mock.timers.enable({ apis: ["setTimeout"] })
  })

  afterEach(() => {
    GlideClient.createClient = original
    mock.timers.reset()
    mock.restoreAll()
  })

  const holdCall = (n: number) => {
    const waits = new Map<number, Promise<void>>([[n, gate(n)]])
    GlideClient.createClient = (async () => {
      calls++
      const wait = waits.get(calls)
      if (wait) await wait
      return calls === 1 ? { close: mock.fn() } : client
    }) as any
  }

  const assertReleased = (username: string) => {
    mock.timers.tick(CONNECTION_TEARDOWN_DELAY_MS)
    assert.strictEqual(getWatcherCount(scopedId(`password~${username}`, CONNECTION_ID)), 0, "no watcher remains")
    assert.strictEqual(client.close.mock.calls.length, 1, "the client is closed")
    assert.strictEqual(findState(username)?.clients.has(CONNECTION_ID) ?? false, false, "the client is removed")
    assert.ok(killed.includes(4242), "the collector is stopped")
  }

  it("releases the connection when the socket closes during client creation", async () => {
    holdCall(2)
    const ws = makeWs()
    const connecting = startConnect(ws, createSocketBinding(), "close-create")
    await flush()
    closeSocket(ws)
    held.get(2)!()
    await connecting
    await flush()
    assertReleased("close-create")
    await flush()
    assert.strictEqual(findState("close-create"), undefined, "the owner entry is removed")
  })

  it("releases the connection when the socket closes during the AUTH probe", async () => {
    holdCall(1)
    const ws = makeWs()
    const connecting = startConnect(ws, createSocketBinding(), "close-probe")
    await flush()
    closeSocket(ws)
    held.get(1)!()
    await connecting
    await flush()
    assertReleased("close-probe")
  })

  it("keeps the connection when another socket of the same owner still watches it", async () => {
    holdCall(2)
    const ws = makeWs()
    const other = makeWs()
    subscribe(scopedId("password~shared-owner", CONNECTION_ID), other)
    const connecting = startConnect(ws, createSocketBinding(), "shared-owner")
    await flush()
    closeSocket(ws)
    held.get(2)!()
    await connecting
    await flush()
    mock.timers.tick(CONNECTION_TEARDOWN_DELAY_MS)
    assert.strictEqual(client.close.mock.calls.length, 0, "the other socket still uses the client")
    assert.ok(findState("shared-owner")?.clients.has(CONNECTION_ID))
    unsubscribe(scopedId("password~shared-owner", CONNECTION_ID), other)
    findState("shared-owner")!.metricsServerMap.clear()
  })

  it("binds the connection as before when the socket stays open", async () => {
    holdCall(2)
    const ws = makeWs()
    const binding = createSocketBinding()
    const connecting = startConnect(ws, binding, "stays-open")
    await flush()
    held.get(2)!()
    await connecting
    mock.timers.tick(CONNECTION_TEARDOWN_DELAY_MS)
    assert.strictEqual(binding.connections.get(CONNECTION_ID), "password~stays-open")
    assert.strictEqual(getWatcherCount(scopedId("password~stays-open", CONNECTION_ID)), 1)
    assert.strictEqual(client.close.mock.calls.length, 0)
    findState("stays-open")!.metricsServerMap.clear()
  })
})
