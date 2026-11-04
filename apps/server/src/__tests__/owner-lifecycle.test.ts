/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert"
import { GlideClient, ClosingError } from "@valkey/valkey-glide"
import { VALKEY } from "valkey-common"
import { allOwnerStates, getEnvOwnerState } from "../owner"
import { createSocketBinding, resolveAction, unbindConnection } from "../socket-binding"
import { connectPending, closeConnection } from "../actions/connection"
import { topologyDiscoveryEndpointPending } from "../actions/topology"
import { connectedNodesFor } from "../socket-binding"
import { teardownConnection } from "../connection"
import { _resetAuthLimiter } from "../auth-limiter"
import { _reset as resetNodeWatchers } from "../node-watchers"
import type { Handler } from "../actions/utils"

/**
 * Owner state lifecycle: an owner entry exists only while Valkey has accepted
 * that identity and the identity still has something on the server. A request
 * with credentials that Valkey rejects, or a discovery, must not add an entry.
 */

const DETAILS = {
  host: "127.0.0.1",
  port: "6379",
  tls: false,
  verifyTlsCertificate: false,
  endpointType: "node",
  db: 0,
}

const wrongPass = () =>
  new ClosingError("Connection error: WRONGPASS: invalid username-password pair or user is disabled.")

const standaloneMock = () => ({
  info: mock.fn(async () => "cluster_enabled:0"),
  customCommand: mock.fn(async () => []),
  configGet: mock.fn(async () => ({ databases: "16" })),
  close: mock.fn(),
})

// Same steps as the dispatch in index.ts: resolve the owner, then run the handler.
const dispatch = async (ws: any, binding: ReturnType<typeof createSocketBinding>, handler: Handler, action: any) => {
  const resolved = resolveAction(binding, action)
  if (!resolved.ok) return resolved
  await handler({
    ws,
    clients: resolved.state?.clients ?? new Map(),
    connectionId: action.payload.connectionId,
    metricsServerMap: resolved.state?.metricsServerMap ?? new Map(),
    connectedNodesByCluster: resolved.ownerKey === undefined ? new Map() : connectedNodesFor(binding, resolved.ownerKey),
    clusterNodesRegistry: resolved.state?.clusterNodesRegistry ?? new Map(),
    ownerKey: resolved.ownerKey,
    ownerState: resolved.state,
    binding,
  } as any)(action)
  return resolved
}

describe("owner state lifecycle", () => {
  let ws: any
  let sent: any[]
  let original: typeof GlideClient.createClient

  beforeEach(() => {
    _resetAuthLimiter()
    resetNodeWatchers()
    sent = []
    ws = { send: (m: string) => sent.push(JSON.parse(m)), readyState: 1, OPEN: 1 }
    original = GlideClient.createClient
    mock.method(console, "error", () => {})
    mock.method(console, "warn", () => {})
    mock.method(console, "log", () => {})
  })

  afterEach(() => {
    GlideClient.createClient = original
    mock.restoreAll()
  })

  it("adds no owner entry for connects that Valkey rejects", async () => {
    GlideClient.createClient = (async () => { throw wrongPass() }) as any
    const before = allOwnerStates().length
    const binding = createSocketBinding()
    for (let i = 0; i < 200; i++) {
      await dispatch(ws, binding, connectPending, {
        type: VALKEY.CONNECTION.connectPending,
        payload: { connectionId: `c-${i}`, connectionDetails: { ...DETAILS, username: `ghost-${i}`, password: "wrong" } },
      })
    }
    assert.strictEqual(allOwnerStates().length, before)
    assert.ok(sent.every((m) => m.type === VALKEY.CONNECTION.connectRejected))
  })

  it("adds no owner entry for topology discovery", async () => {
    GlideClient.createClient = (async () => { throw wrongPass() }) as any
    const before = allOwnerStates().length
    const binding = createSocketBinding()
    for (let i = 0; i < 200; i++) {
      await dispatch(ws, binding, topologyDiscoveryEndpointPending, {
        type: VALKEY.TOPOLOGY.discoveryEndpointPending,
        payload: { discoveryId: `d-${i}`, connectionDetails: { ...DETAILS, username: `seeker-${i}`, password: "wrong" } },
      })
    }
    assert.strictEqual(allOwnerStates().length, before)
  })

  it("adds no owner entry for a resume that asks for the password", async () => {
    const before = allOwnerStates().length
    await dispatch(ws, createSocketBinding(), connectPending, {
      type: VALKEY.CONNECTION.connectPending,
      payload: { connectionId: "r", isResume: true, connectionDetails: { ...DETAILS, username: "resumer" } },
    })
    assert.strictEqual(allOwnerStates().length, before)
    assert.strictEqual(sent.at(-1).payload.requiresAuth, true)
  })

  it("creates the entry after Valkey accepts the credentials, and removes it after the last connection closes", async () => {
    GlideClient.createClient = (async () => standaloneMock()) as any
    const ownerKey = "password~lifecycle-user@127.0.0.1:6379"
    const binding = createSocketBinding()
    const details = { ...DETAILS, username: "lifecycle-user", password: "pw" }

    await dispatch(ws, binding, connectPending, {
      type: VALKEY.CONNECTION.connectPending,
      payload: { connectionId: "127-0-0-1-6379-db0", connectionDetails: details },
    })
    const state = allOwnerStates().find((s) => s.ownerKey === ownerKey)
    assert.ok(state, "an accepted connect creates the owner entry")
    assert.ok(state.clients.has("127-0-0-1-6379-db0"))
    // No collector process in this test; the spawn is not under test here.
    state.metricsServerMap.clear()
    state.collectorKeys.clear()

    await dispatch(ws, binding, closeConnection, {
      type: VALKEY.CONNECTION.closeConnection,
      payload: { connectionId: "127-0-0-1-6379-db0" },
    })
    assert.strictEqual(
      allOwnerStates().some((s) => s.ownerKey === ownerKey),
      false,
      "the entry is removed when the owner has nothing left",
    )
  })

  it("keeps the entry while the owner still has a client", async () => {
    GlideClient.createClient = (async () => standaloneMock()) as any
    const ownerKey = "password~two-dbs@127.0.0.1:6379"
    const binding = createSocketBinding()
    const details = { ...DETAILS, username: "two-dbs", password: "pw" }
    for (const db of [0, 1]) {
      await dispatch(ws, binding, connectPending, {
        type: VALKEY.CONNECTION.connectPending,
        payload: { connectionId: `127-0-0-1-6379-db${db}`, connectionDetails: { ...details, db } },
      })
    }
    const state = allOwnerStates().find((s) => s.ownerKey === ownerKey)!
    state.metricsServerMap.clear()
    state.collectorKeys.clear()

    unbindConnection(binding, "127-0-0-1-6379-db0")
    teardownConnection(state, "127-0-0-1-6379-db0")
    assert.ok(allOwnerStates().includes(state), "the entry stays while db1 is open")

    teardownConnection(state, "127-0-0-1-6379-db1")
    assert.strictEqual(allOwnerStates().includes(state), false)
  })

  it("rejects an action on a binding whose owner entry is gone, and does not recreate the entry", () => {
    const binding = createSocketBinding()
    binding.connections.set("stale-db0", "password~gone-owner")
    const before = allOwnerStates().length
    const result = resolveAction(binding, {
      type: VALKEY.COMMAND.sendRequested,
      payload: { connectionId: "stale-db0" },
    })
    assert.strictEqual(result.ok, false)
    assert.strictEqual(allOwnerStates().length, before)
  })

  it("never removes the env owner", () => {
    const env = getEnvOwnerState()
    env.clients.set("env-only-db0", { client: { close: mock.fn() } as any })
    teardownConnection(env, "env-only-db0")
    assert.ok(allOwnerStates().includes(env))
  })
})
