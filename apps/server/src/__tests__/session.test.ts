/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach } from "node:test"
import assert from "node:assert"
import {
  ensureSession,
  authorizeConnection,
  isConnectionAuthorized,
  revokeConnection,
  hasAuthorizedSession,
  setSessionExpiryListener,
  _resetSessions
} from "../session"
import type { IncomingMessage } from "http"

const TTL_MS = 24 * 60 * 60 * 1000

const makeReq = (cookie?: string): IncomingMessage =>
  ({ headers: cookie ? { cookie } : {}, socket: {} }) as any

const cookieFor = (sessionId: string) => `vk_sid=${sessionId}`

// override Date.now so we can control the passage of time in tests and not wait for real time to pass
let now = 0
const realNow = Date.now

beforeEach(() => {
  now = 1_000_000_000
  Date.now = () => now
  _resetSessions()
})

afterEach(() => {
  Date.now = realNow
})

describe("session", () => {
  // When two sessions share a connection, it should stay authorized until the last one revokes it.
  it("only frees a connection once the last session using it revokes it", () => {
    const sessionA = ensureSession(makeReq()).sessionId
    const sessionB = ensureSession(makeReq()).sessionId
    authorizeConnection(sessionA, "shared")
    authorizeConnection(sessionB, "shared")

    revokeConnection(sessionA, "shared")
    assert.strictEqual(hasAuthorizedSession("shared"), true)

    revokeConnection(sessionB, "shared")
    assert.strictEqual(hasAuthorizedSession("shared"), false)
  })

  it("hands the expiry listener any connection left with no session behind it", () => {
    const orphaned: string[][] = []
    setSessionExpiryListener((ids) => orphaned.push(ids))

    const { sessionId } = ensureSession(makeReq())
    authorizeConnection(sessionId, "conn-1")

    now += TTL_MS + 1
    ensureSession(makeReq(cookieFor(sessionId)))

    assert.deepStrictEqual(orphaned, [["conn-1"]])
  })

  // One session expiring shouldn't drop a connection another session is still using.
  it("leaves a shared connection alone when only one of its sessions expires", () => {
    const orphaned: string[][] = []
    setSessionExpiryListener((ids) => orphaned.push(ids))

    const sessionA = ensureSession(makeReq()).sessionId
    authorizeConnection(sessionA, "shared")

    // Start sessionB almost a full TTL later so it's still alive once sessionA times out.
    now += TTL_MS - 1
    const sessionB = ensureSession(makeReq()).sessionId
    authorizeConnection(sessionB, "shared")

    // sessionA is now past its TTL but sessionB isn't; touching sessionA trips its expiry.
    now += 2
    ensureSession(makeReq(cookieFor(sessionA)))

    assert.deepStrictEqual(orphaned, [])
    assert.strictEqual(isConnectionAuthorized(sessionB, "shared"), true)
  })

  // Shared use: two users connect to the same cluster — both are authorized
  it("allows multiple sessions to share a connection when both have connected", () => {
    const sessionA = ensureSession(makeReq()).sessionId
    const sessionB = ensureSession(makeReq()).sessionId
    const connectionId = "10-0-1-5-6379-db0"

    // Both users go through the connect flow (connectPending → authorizeConnection)
    authorizeConnection(sessionA, connectionId)
    authorizeConnection(sessionB, connectionId)

    // Both can access the shared connection
    assert.strictEqual(isConnectionAuthorized(sessionA, connectionId), true)
    assert.strictEqual(isConnectionAuthorized(sessionB, connectionId), true)
  })

  // Attack: a session tries to use a connection it never established
  it("rejects a session that never connected from using another session's connection", () => {
    const victim = ensureSession(makeReq()).sessionId
    const attacker = ensureSession(makeReq()).sessionId
    const connectionId = "10-0-1-5-6379-db0"

    // Victim connects — gets authorized
    authorizeConnection(victim, connectionId)

    // Attacker skips connectPending and tries to use the connection directly
    assert.strictEqual(isConnectionAuthorized(attacker, connectionId), false)
  })

  // Attack: guessing deterministic connectionIds without connecting
  it("rejects guessed connectionIds from unauthorized sessions", () => {
    const attacker = ensureSession(makeReq()).sessionId

    // connectionIds are deterministic (host-port-dbN) and therefore guessable
    assert.strictEqual(isConnectionAuthorized(attacker, "production-redis-6379-db0"), false)
    assert.strictEqual(isConnectionAuthorized(attacker, "10-0-1-5-6379-db0"), false)
    assert.strictEqual(isConnectionAuthorized(attacker, "cache-cluster-6379-db2"), false)
  })
})
