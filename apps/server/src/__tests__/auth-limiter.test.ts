/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert"
import { GlideClient, ClosingError } from "@valkey/valkey-glide"
import { VALKEY } from "valkey-common"
import {
  AUTH_FAILURE_LIMIT,
  authLimitKey,
  isAuthError,
  _resetAuthLimiter
} from "../auth-limiter"
import { connectToValkey, discoverTopology } from "../connection"
import { createOwnerState } from "../owner"
import { _reset as resetNodeWatchers } from "../node-watchers"
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
  let originalCreate: typeof GlideClient.createClient
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
    originalCreate = GlideClient.createClient
    GlideClient.createClient = (async () => {
      createCalls++
      throw wrongPass()
    }) as any
    realNow = Date.now
    now = 1_000_000_000
    Date.now = () => now
    mock.method(console, "error", () => {})
    mock.method(console, "warn", () => {})
  })

  afterEach(() => {
    GlideClient.createClient = originalCreate
    Date.now = realNow
    mock.restoreAll()
  })

  it("classifies authentication errors only", () => {
    assert.strictEqual(isAuthError(wrongPass()), true)
    assert.strictEqual(isAuthError(new Error("NOAUTH HELLO must be called with the client already authenticated")), true)
    assert.strictEqual(isAuthError(new Error("Connection refused")), false)
    assert.strictEqual(isAuthError(new Error("PermissionDenied: User x has no permissions to run the 'info' command")), false)
  })

  it("keys by host:port and owner, not by connectionId or db", () => {
    assert.strictEqual(authLimitKey({ ...DETAILS, db: 3 }), authLimitKey(DETAILS))
    assert.notStrictEqual(authLimitKey({ ...DETAILS, username: "bob" }), authLimitKey(DETAILS))
    assert.notStrictEqual(authLimitKey({ ...DETAILS, port: "6380" }), authLimitKey(DETAILS))
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
    GlideClient.createClient = (async () => {
      createCalls++
      throw new Error("Connection refused")
    }) as any
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
})
