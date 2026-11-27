/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert"
import { ClosingError } from "@valkey/valkey-glide"
import { EndpointError, VALKEY, normalizeEndpoint } from "valkey-common"
import {
  AUTH_FAILURE_LIMIT,
  AuthLockedError,
  authLimitKey,
  isAuthError,
  withAuthLimit,
  _resetAuthLimiter
} from "../auth-limiter"
import { connectToValkey, discoverTopology } from "../connection"
import { createOwnerState } from "../owner"
import { _reset as resetNodeWatchers } from "../node-watchers"
import { mockAuthProbe, wrongPassReply } from "./auth-probe-mock"
import type { ConnectionDetails } from "../actions/connection"

const DETAILS: ConnectionDetails = {
  host: "127.0.0.1",
  port: "6379",
  username: "alice",
  password: "wrong",
  tls: false,
  verifyTlsCertificate: false,
  endpointType: "node",
  db: 0,
}

const wrongPass = () =>
  new ClosingError(
    "Connection error: Standalone(Received error for address `127.0.0.1:6379`: " +
    "WRONGPASS: invalid username-password pair or user is disabled.\n)",
  )

describe("auth-limiter", () => {
  let messages: any[]
  let ws: any
  let createCalls: number
  let probeFails: () => Promise<never>
  let probe: ReturnType<typeof mockAuthProbe>
  let realNow: () => number
  let now: number

  const connect = (details: ConnectionDetails = DETAILS, connectionId = "conn-1") =>
    connectToValkey(
      { ...createOwnerState("password~alice"), connectedNodesByCluster: new Map() },
      ws,
      { connectionDetails: details, connectionId },
    )

  const lastType = () => messages[messages.length - 1]?.type
  const lastPayload = () => messages[messages.length - 1]?.payload

  beforeEach(() => {
    _resetAuthLimiter()
    resetNodeWatchers()
    messages = []
    ws = { send: (m: string) => messages.push(JSON.parse(m)), readyState: 1, OPEN: 1 }
    createCalls = 0
    probeFails = async () => { throw wrongPassReply() }
    probe = mockAuthProbe(() => {
      createCalls++
      return probeFails()
    })
    realNow = Date.now
    now = 1_000_000_000
    Date.now = () => now
    mock.method(console, "error", () => {})
    mock.method(console, "warn", () => {})
  })

  afterEach(() => {
    probe.restore()
    Date.now = realNow
    mock.restoreAll()
  })

  it("classifies authentication errors only", () => {
    assert.strictEqual(isAuthError(wrongPass()), true)
    assert.strictEqual(isAuthError(wrongPassReply()), true)
    assert.strictEqual(isAuthError(new Error("NOAUTH HELLO must be called with the client already authenticated")), true)
    assert.strictEqual(isAuthError(new Error("Connection refused")), false)
    assert.strictEqual(isAuthError(new Error("PermissionDenied: User x has no permissions to run the 'info' command")), false)
  })

  it("keys by normalized host:port and identity, not by connectionId, db or spelling", () => {
    const ep = (host: string, port: string | number) => normalizeEndpoint(host, port)
    const base = authLimitKey(DETAILS, ep(DETAILS.host, DETAILS.port))
    assert.strictEqual(authLimitKey(DETAILS, ep(DETAILS.host, DETAILS.port)), base)
    assert.notStrictEqual(authLimitKey({ ...DETAILS, username: "bob" }, ep(DETAILS.host, DETAILS.port)), base)
    assert.notStrictEqual(authLimitKey(DETAILS, ep(DETAILS.host, "6380")), base)
    // Other spellings of one endpoint must share the bucket.
    assert.strictEqual(authLimitKey(DETAILS, ep("Cache.internal", "6379")), authLimitKey(DETAILS, ep("cache.internal.", "6379")))
    assert.throws(() => ep("cache.internal", "06379"), EndpointError)
  })

  it(`rejects without contacting Valkey after ${AUTH_FAILURE_LIMIT} failures`, async () => {
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) {
      await connect()
      assert.strictEqual(lastType(), VALKEY.CONNECTION.connectRejected)
    }
    assert.strictEqual(createCalls, AUTH_FAILURE_LIMIT)

    await connect()
    assert.strictEqual(createCalls, AUTH_FAILURE_LIMIT, "a locked key must not reach Valkey")
    assert.strictEqual(lastType(), VALKEY.CONNECTION.connectRejected)
    assert.match(lastPayload().errorMessage, /Too many failed authentication attempts/)
  })

  it("is not bypassed by changing the connectionId", async () => {
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) await connect(DETAILS, `conn-${i}`)
    await connect(DETAILS, "conn-new")
    assert.strictEqual(createCalls, AUTH_FAILURE_LIMIT)
  })

  it("does not block another owner or another node", async () => {
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) await connect()
    await connect({ ...DETAILS, username: "bob" })
    await connect({ ...DETAILS, port: "6380" }, "conn-6380")
    assert.strictEqual(createCalls, AUTH_FAILURE_LIMIT + 2)
  })

  it("does not count errors that are not authentication failures", async () => {
    probeFails = async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:6379") }
    for (let i = 0; i < AUTH_FAILURE_LIMIT + 2; i++) await connect()
    assert.strictEqual(createCalls, AUTH_FAILURE_LIMIT + 2)
  })

  it("unlocks when the window expires", async () => {
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) await connect()
    now += 61_000
    await connect()
    assert.strictEqual(createCalls, AUTH_FAILURE_LIMIT + 1)
  })

  it("also limits topology discovery", async () => {
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) {
      await discoverTopology(ws, { discoveryId: "d", connectionDetails: DETAILS })
    }
    await discoverTopology(ws, { discoveryId: "d", connectionDetails: DETAILS })
    assert.strictEqual(createCalls, AUTH_FAILURE_LIMIT)
    assert.strictEqual(lastType(), VALKEY.TOPOLOGY.discoveryEndpointRejected)
    assert.match(lastPayload().errorMessage, /Too many failed authentication attempts/)
  })

  it("limits a burst of concurrent connects to the failure limit", async () => {
    // Every connect starts before any probe fails, as in a scripted burst.
    let failAll!: () => void
    const allStarted = new Promise<void>((resolve) => { failAll = resolve })
    probeFails = async () => {
      await allStarted
      throw wrongPassReply()
    }
    const burst = Array.from({ length: AUTH_FAILURE_LIMIT * 3 }, (_, i) => connect(DETAILS, `conn-${i}`))
    await new Promise((resolve) => setImmediate(resolve))
    failAll()
    await Promise.all(burst)

    assert.strictEqual(createCalls, AUTH_FAILURE_LIMIT, "only the free slots reach Valkey")
    const rejections = messages.filter((m) => m.type === VALKEY.CONNECTION.connectRejected)
    assert.strictEqual(rejections.length, AUTH_FAILURE_LIMIT * 3)
    assert.strictEqual(
      rejections.filter((m) => /Too many failed authentication attempts/.test(m.payload.errorMessage)).length,
      AUTH_FAILURE_LIMIT * 2,
    )

    await connect(DETAILS, "conn-after")
    assert.strictEqual(createCalls, AUTH_FAILURE_LIMIT, "the key stays locked after the burst")
  })
})

describe("withAuthLimit", () => {
  const endpoint = normalizeEndpoint(DETAILS.host, DETAILS.port)
  const authFail = async () => { throw wrongPass() }
  const attempt = (fn: () => Promise<unknown>) => withAuthLimit(DETAILS, endpoint, fn).then(() => "ok", (err) => err)
  let realNow: () => number
  let now: number

  beforeEach(() => {
    _resetAuthLimiter()
    realNow = Date.now
    now = 1_000_000_000
    Date.now = () => now
  })

  afterEach(() => {
    Date.now = realNow
  })

  it("counts an attempt in progress against the limit", async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    const inFlight = Array.from({ length: AUTH_FAILURE_LIMIT }, () => attempt(() => pending))
    assert.ok(await attempt(async () => {}) instanceof AuthLockedError, "no free slot while all are in progress")
    finish()
    assert.deepStrictEqual(await Promise.all(inFlight), Array(AUTH_FAILURE_LIMIT).fill("ok"))
    assert.strictEqual(await attempt(async () => {}), "ok", "successful attempts give their slots back")
  })

  it("gives the slot back when the attempt fails for another reason", async () => {
    for (let i = 0; i < AUTH_FAILURE_LIMIT * 2; i++) {
      await attempt(async () => { throw new Error("Connection refused") })
    }
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) await attempt(authFail)
    assert.ok(await attempt(async () => {}) instanceof AuthLockedError)
  })

  it("does not take a slot from a new window when an old attempt ends", async () => {
    let finish!: () => void
    const slow = attempt(() => new Promise<void>((resolve) => { finish = resolve }))
    now += 61_000
    for (let i = 0; i < AUTH_FAILURE_LIMIT; i++) await attempt(authFail)
    finish()
    assert.strictEqual(await slow, "ok")
    assert.ok(await attempt(async () => {}) instanceof AuthLockedError, "the new window keeps all its failures")
  })
})
