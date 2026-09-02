import { describe, it } from "node:test"
import assert from "node:assert"
import {
  ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS,
  ORCHESTRATOR_AUTH_DOMAIN,
  ORCHESTRATOR_AUTH_VERSION,
  ORCHESTRATOR_RATE_LIMIT_DEFAULT_MAX,
  buildOrchestratorAuthMessage,
  createOrchestratorAuthCredential,
  generateOrchestratorAuthKey,
  resolveOrchestratorAuthWindowMs,
  resolveOrchestratorRateLimitMax,
  signOrchestratorAuthMessage,
  verifyOrchestratorAuthCredential
} from "../orchestrator-auth"

const KEY = "0".repeat(64)
const OTHER_KEY = "1".repeat(64)
const NODE_ID = "127-0-0-1-6379"
const URI = "http://127.0.0.1:54321"
const NOW = 1_772_404_800_000

const registerFields = { nodeId: NODE_ID, metricsServerUri: URI, timestamp: NOW }
const pingFields = { nodeId: NODE_ID, timestamp: NOW }

const credentialFor = (
  domain: typeof ORCHESTRATOR_AUTH_DOMAIN.REGISTER | typeof ORCHESTRATOR_AUTH_DOMAIN.PING,
  fields: { nodeId: string; timestamp: number; metricsServerUri?: string },
  key = KEY,
) => {
  const credential = createOrchestratorAuthCredential(key, domain, fields)
  assert.ok(credential, "expected fields to be signable")
  return credential
}

describe("buildOrchestratorAuthMessage", () => {
  // Pinned literals. The server and every collector derive their tag from
  // this exact byte string, so an accidental format change must fail loudly
  // rather than silently invalidate every credential in the fleet.
  it("builds the register message in the pinned wire format", () => {
    assert.strictEqual(
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields),
      `v1\nregister\n${NODE_ID}\n${URI}\n${NOW}`,
    )
  })

  it("builds the ping message in the pinned wire format", () => {
    assert.strictEqual(
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.PING, pingFields),
      `v1\nping\n${NODE_ID}\n${NOW}`,
    )
  })

  it("omits metricsServerUri from the ping message even when supplied", () => {
    assert.strictEqual(
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.PING, {
        ...pingFields,
        metricsServerUri: URI,
      }),
      `v1\nping\n${NODE_ID}\n${NOW}`,
    )
  })

  it("produces different messages per domain for identical fields", () => {
    assert.notStrictEqual(
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields),
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.PING, registerFields),
    )
  })

  it("rejects an empty nodeId", () => {
    assert.strictEqual(
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, { ...registerFields, nodeId: "" }),
      null,
    )
  })

  it("rejects a nodeId containing the field separator", () => {
    assert.strictEqual(
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, {
        ...registerFields,
        nodeId: "a\nb",
      }),
      null,
    )
  })

  // Without this rejection the field boundaries are ambiguous: a URI carrying
  // a newline could shift the timestamp into the URI field, letting two
  // distinct claims serialize to the same message and share one valid tag.
  it("rejects a metricsServerUri containing the field separator", () => {
    assert.strictEqual(
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, {
        ...registerFields,
        metricsServerUri: `http://a\n${NOW}`,
      }),
      null,
    )
  })

  it("rejects a register message with no metricsServerUri", () => {
    assert.strictEqual(
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, pingFields),
      null,
    )
  })

  it("rejects an empty metricsServerUri", () => {
    assert.strictEqual(
      buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, {
        ...registerFields,
        metricsServerUri: "",
      }),
      null,
    )
  })

  it("rejects non-integer, negative, and non-finite timestamps", () => {
    for (const timestamp of [1.5, -1, NaN, Infinity]) {
      assert.strictEqual(
        buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, { ...registerFields, timestamp }),
        null,
        `expected timestamp ${timestamp} to be rejected`,
      )
    }
  })
})

describe("verifyOrchestratorAuthCredential", () => {
  it("accepts a credential over unmodified fields", () => {
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential: credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields),
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: registerFields,
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, { ok: true })
  })

  it("accepts a ping credential", () => {
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential: credentialFor(ORCHESTRATOR_AUTH_DOMAIN.PING, pingFields),
      domain: ORCHESTRATOR_AUTH_DOMAIN.PING,
      fields: pingFields,
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, { ok: true })
  })

  // Claim binding: this is the property that stops a captured credential from
  // being retargeted at an attacker-controlled URI.
  it("rejects a captured credential replayed with a substituted metricsServerUri", () => {
    const credential = credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields)
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential,
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: { ...registerFields, metricsServerUri: "http://attacker.example/" },
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_signature" })
  })

  it("rejects a credential replayed for a different nodeId", () => {
    const credential = credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields)
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential,
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: { ...registerFields, nodeId: "10-0-0-9-6379" },
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_signature" })
  })

  it("rejects a credential whose timestamp was altered in transit", () => {
    const credential = credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields)
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential,
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: { ...registerFields, timestamp: NOW + 1 },
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_signature" })
  })

  it("rejects a credential signed with a different key", () => {
    const credential = credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields, OTHER_KEY)
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential,
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: registerFields,
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_signature" })
  })

  // Domain separation, in both directions.
  it("rejects a register credential presented as a ping", () => {
    const credential = credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields)
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential,
      domain: ORCHESTRATOR_AUTH_DOMAIN.PING,
      fields: pingFields,
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_signature" })
  })

  it("rejects a ping credential presented as a registration", () => {
    const credential = credentialFor(ORCHESTRATOR_AUTH_DOMAIN.PING, pingFields)
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential,
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: registerFields,
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, { ok: false, reason: "invalid_signature" })
  })

  it("reports skew for a timestamp older than the window", () => {
    const staleFields = { ...registerFields, timestamp: NOW - (ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS + 1) }
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential: credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, staleFields),
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: staleFields,
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, {
      ok: false,
      reason: "stale_timestamp",
      skewMs: ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS + 1,
    })
  })

  it("reports skew for a timestamp further ahead than the window", () => {
    const futureFields = { ...registerFields, timestamp: NOW + (ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS + 1) }
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential: credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, futureFields),
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: futureFields,
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, {
      ok: false,
      reason: "stale_timestamp",
      skewMs: -(ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS + 1),
    })
  })

  it("accepts a timestamp exactly at the window edge", () => {
    const edgeFields = { ...registerFields, timestamp: NOW - ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS }
    const result = verifyOrchestratorAuthCredential({
      key: KEY,
      credential: credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, edgeFields),
      domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
      fields: edgeFields,
      nowMs: NOW,
    })
    assert.deepStrictEqual(result, { ok: true })
  })

  it("honours an explicit window override", () => {
    const fields = { ...registerFields, timestamp: NOW - 5_000 }
    const credential = credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, fields)
    assert.deepStrictEqual(
      verifyOrchestratorAuthCredential({
        key: KEY, credential, domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER, fields, nowMs: NOW, windowMs: 1_000,
      }),
      { ok: false, reason: "stale_timestamp", skewMs: 5_000 },
    )
    assert.deepStrictEqual(
      verifyOrchestratorAuthCredential({
        key: KEY, credential, domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER, fields, nowMs: NOW, windowMs: 10_000,
      }),
      { ok: true },
    )
  })

  it("rejects an absent or empty credential", () => {
    for (const credential of [undefined, null, ""]) {
      assert.deepStrictEqual(
        verifyOrchestratorAuthCredential({
          key: KEY, credential, domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER, fields: registerFields, nowMs: NOW,
        }),
        { ok: false, reason: "missing_credential" },
      )
    }
  })

  it("rejects a credential with no version separator", () => {
    assert.deepStrictEqual(
      verifyOrchestratorAuthCredential({
        key: KEY,
        credential: "deadbeef",
        domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
        fields: registerFields,
        nowMs: NOW,
      }),
      { ok: false, reason: "malformed_credential" },
    )
  })

  it("rejects a credential with an empty tag", () => {
    assert.deepStrictEqual(
      verifyOrchestratorAuthCredential({
        key: KEY,
        credential: `${ORCHESTRATOR_AUTH_VERSION};`,
        domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
        fields: registerFields,
        nowMs: NOW,
      }),
      { ok: false, reason: "malformed_credential" },
    )
  })

  it("rejects an unsupported protocol version", () => {
    const tag = credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields).split(";")[1]
    assert.deepStrictEqual(
      verifyOrchestratorAuthCredential({
        key: KEY,
        credential: `v2;${tag}`,
        domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
        fields: registerFields,
        nowMs: NOW,
      }),
      { ok: false, reason: "unsupported_version" },
    )
  })

  it("rejects verification with no key material", () => {
    for (const key of [undefined, ""]) {
      assert.deepStrictEqual(
        verifyOrchestratorAuthCredential({
          key,
          credential: credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields),
          domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
          fields: registerFields,
          nowMs: NOW,
        }),
        { ok: false, reason: "missing_key" },
      )
    }
  })

  it("reports unrepresentable fields as invalid rather than throwing", () => {
    assert.deepStrictEqual(
      verifyOrchestratorAuthCredential({
        key: KEY,
        credential: credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields),
        domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
        fields: { ...registerFields, metricsServerUri: "http://a\nb" },
        nowMs: NOW,
      }),
      { ok: false, reason: "invalid_fields" },
    )
  })

  // `crypto.timingSafeEqual` throws on unequal buffer lengths, so a
  // short or overlong tag must be rejected by the length guard rather than
  // escaping as an exception and becoming a 500.
  it("rejects tags of the wrong length without throwing", () => {
    for (const tag of ["a", "a".repeat(200)]) {
      assert.deepStrictEqual(
        verifyOrchestratorAuthCredential({
          key: KEY,
          credential: `${ORCHESTRATOR_AUTH_VERSION};${tag}`,
          domain: ORCHESTRATOR_AUTH_DOMAIN.REGISTER,
          fields: registerFields,
          nowMs: NOW,
        }),
        { ok: false, reason: "invalid_signature" },
      )
    }
  })
})

describe("createOrchestratorAuthCredential", () => {
  it("round-trips with signOrchestratorAuthMessage", () => {
    const message = buildOrchestratorAuthMessage(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields)
    assert.ok(message)
    assert.strictEqual(
      createOrchestratorAuthCredential(KEY, ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields),
      signOrchestratorAuthMessage(KEY, message),
    )
  })

  it("is prefixed with the protocol version", () => {
    assert.match(
      credentialFor(ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields),
      /^v1;[A-Za-z0-9_-]+$/,
    )
  })

  it("returns null rather than an unsigned request when fields are unsignable", () => {
    assert.strictEqual(
      createOrchestratorAuthCredential(KEY, ORCHESTRATOR_AUTH_DOMAIN.REGISTER, {
        ...registerFields,
        nodeId: "",
      }),
      null,
    )
  })

  it("returns null when no key is available", () => {
    assert.strictEqual(
      createOrchestratorAuthCredential("", ORCHESTRATOR_AUTH_DOMAIN.REGISTER, registerFields),
      null,
    )
  })
})

describe("generateOrchestratorAuthKey", () => {
  it("returns 32 bytes hex encoded", () => {
    assert.match(generateOrchestratorAuthKey(), /^[0-9a-f]{64}$/)
  })

  it("returns distinct keys across calls", () => {
    const keys = new Set(Array.from({ length: 50 }, generateOrchestratorAuthKey))
    assert.strictEqual(keys.size, 50)
  })
})

describe("resolveOrchestratorAuthWindowMs", () => {
  it("honours a positive numeric value", () => {
    assert.strictEqual(resolveOrchestratorAuthWindowMs("5000"), 5000)
  })

  it("falls back to the default for absent, non-numeric, and non-positive input", () => {
    for (const raw of [undefined, "", "abc", "0", "-1"]) {
      assert.strictEqual(
        resolveOrchestratorAuthWindowMs(raw),
        ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS,
        `expected ${JSON.stringify(raw)} to fall back`,
      )
    }
  })
})

describe("resolveOrchestratorRateLimitMax", () => {
  it("honours a positive integer value", () => {
    assert.strictEqual(resolveOrchestratorRateLimitMax("1200"), 1200)
  })

  // The default has to cover a whole cluster, not one collector: spawned
  // collectors share a single loopback bucket at 6 requests per minute each.
  it("defaults high enough for a large cluster's shared loopback bucket", () => {
    assert.ok(
      ORCHESTRATOR_RATE_LIMIT_DEFAULT_MAX >= 6 * 50,
      "default must tolerate at least a 50-node cluster pinging every 10s",
    )
  })

  it("falls back to the default for absent, non-numeric, fractional, and non-positive input", () => {
    for (const raw of [undefined, "", "abc", "0", "-1", "1.5"]) {
      assert.strictEqual(
        resolveOrchestratorRateLimitMax(raw),
        ORCHESTRATOR_RATE_LIMIT_DEFAULT_MAX,
        `expected ${JSON.stringify(raw)} to fall back`,
      )
    }
  })
})
