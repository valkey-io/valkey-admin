import { describe, it, expect, afterEach } from "vitest"
import {
  ORCHESTRATOR_AUTH_DOMAIN,
  ORCHESTRATOR_AUTH_HEADER,
  ORCHESTRATOR_AUTH_KEY_ENV,
  verifyOrchestratorAuthCredential
} from "valkey-common"
import { buildPingRequest, buildRegisterRequest, readOrchestratorKey } from "./orchestrator-auth.js"

const KEY = "c".repeat(64)
const NODE_ID = "127-0-0-1-6379"
const URI = "http://10.0.0.5:3000"

describe("readOrchestratorKey", () => {
  afterEach(() => { delete process.env[ORCHESTRATOR_AUTH_KEY_ENV] })

  it("reads the key from the environment", () => {
    process.env[ORCHESTRATOR_AUTH_KEY_ENV] = KEY
    expect(readOrchestratorKey()).toBe(KEY)
  })

  it("is undefined when unset", () => {
    expect(readOrchestratorKey()).toBeUndefined()
  })
})

describe("buildRegisterRequest", () => {
  it("sends the credential in the agreed header alongside the JSON content type", () => {
    const request = buildRegisterRequest({ key: KEY, nodeId: NODE_ID, metricsServerUri: URI })

    expect(request.headers["Content-Type"]).toBe("application/json")
    expect(request.headers[ORCHESTRATOR_AUTH_HEADER]).toMatch(/^v1;[A-Za-z0-9_-]+$/)
  })

  // Every field on the wire is signed, so this assertion doubles as a guard
  // against reintroducing an unsigned one.
  it("sends exactly the signed fields and nothing else", () => {
    const timestamp = 1_772_404_800_000
    const request = buildRegisterRequest({
      key: KEY, nodeId: NODE_ID, metricsServerUri: URI, timestamp,
    })

    expect(JSON.parse(request.body)).toEqual({
      nodeId: NODE_ID,
      metricsServerUri: URI,
      timestamp,
    })
  })

  it("does not report a process id, which the orchestrator would ignore", () => {
    const request = buildRegisterRequest({
      key: KEY, nodeId: NODE_ID, metricsServerUri: URI, timestamp: 1_772_404_800_000,
    })

    expect(JSON.parse(request.body)).not.toHaveProperty("pid")
  })

  // Contract test across the two sides of the protocol: what the collector
  // produces must satisfy the orchestrator's verifier, using only the fields
  // that actually travel on the wire.
  it("produces a credential the orchestrator accepts", () => {
    const timestamp = Date.now()
    const request = buildRegisterRequest({
      key: KEY, nodeId: NODE_ID, metricsServerUri: URI, timestamp,
    })
    const body = JSON.parse(request.body)

    expect(verifyOrchestratorAuthCredential({
      key: KEY,
      credential: request.headers[ORCHESTRATOR_AUTH_HEADER],
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: {
        nodeId: body.nodeId,
        metricsServerUri: body.metricsServerUri,
        timestamp: body.timestamp,
      },
      nowMs: timestamp,
    })).toEqual({ ok: true })
  })

  it("returns null rather than an unsigned request when no key is available", () => {
    expect(buildRegisterRequest({ nodeId: NODE_ID, metricsServerUri: URI })).toBeNull()
    expect(buildRegisterRequest({ key: "", nodeId: NODE_ID, metricsServerUri: URI })).toBeNull()
  })

  it("returns null when the fields cannot be signed", () => {
    expect(buildRegisterRequest({ key: KEY, nodeId: "", metricsServerUri: URI })).toBeNull()
    expect(buildRegisterRequest({ key: KEY, nodeId: NODE_ID, metricsServerUri: "" })).toBeNull()
  })
})

describe("buildPingRequest", () => {
  it("carries only the signed ping fields", () => {
    const timestamp = 1_772_404_800_000
    const request = buildPingRequest({ key: KEY, nodeId: NODE_ID, timestamp })

    expect(JSON.parse(request.body)).toEqual({ nodeId: NODE_ID, timestamp })
    expect(request.headers[ORCHESTRATOR_AUTH_HEADER]).toMatch(/^v1;[A-Za-z0-9_-]+$/)
  })

  it("produces a credential the orchestrator accepts as a ping", () => {
    const timestamp = Date.now()
    const request = buildPingRequest({ key: KEY, nodeId: NODE_ID, timestamp })

    expect(verifyOrchestratorAuthCredential({
      key: KEY,
      credential: request.headers[ORCHESTRATOR_AUTH_HEADER],
      domain: ORCHESTRATOR_AUTH_DOMAIN.PING,
      fields: { nodeId: NODE_ID, timestamp },
      nowMs: timestamp,
    })).toEqual({ ok: true })
  })

  // Domain separation, verified from the collector's own output.
  it("produces a credential the orchestrator refuses as a registration", () => {
    const timestamp = Date.now()
    const request = buildPingRequest({ key: KEY, nodeId: NODE_ID, timestamp })

    expect(verifyOrchestratorAuthCredential({
      key: KEY,
      credential: request.headers[ORCHESTRATOR_AUTH_HEADER],
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: { nodeId: NODE_ID, metricsServerUri: URI, timestamp },
      nowMs: timestamp,
    })).toEqual({ ok: false, reason: "invalid_signature" })
  })

  it("returns null rather than an unsigned request when no key is available", () => {
    expect(buildPingRequest({ nodeId: NODE_ID })).toBeNull()
  })
})
