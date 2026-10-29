import { describe, it } from "node:test"
import assert from "node:assert"
import { EndpointError, isNodeId, normalizeEndpoint, toNodeId } from "../connection-id"

describe("toNodeId", () => {
  // The shared db-strip helper that turns a Connection_Identifier
  // (`<host>-<port>-db<N>`) into the db-less metrics-node-id (`<host>-<port>`).
  it("strips a trailing -db0 suffix", () => {
    assert.strictEqual(toNodeId("127-0-0-1-6379-db0"), "127-0-0-1-6379")
  })

  it("strips a trailing -db15 suffix (multi-digit)", () => {
    assert.strictEqual(toNodeId("valkey-7001-7001-db15"), "valkey-7001-7001")
  })

  it("is idempotent on already-stripped ids", () => {
    assert.strictEqual(toNodeId("valkey-7001-7001"), "valkey-7001-7001")
  })

  it("does not touch a non-trailing -db<N> token", () => {
    assert.strictEqual(toNodeId("dbserver-db5-host-6379"), "dbserver-db5-host-6379")
  })

  it("does not strip when -db is followed by non-digits", () => {
    assert.strictEqual(toNodeId("host-6379-dbx"), "host-6379-dbx")
  })

  it("returns the empty string unchanged", () => {
    assert.strictEqual(toNodeId(""), "")
  })
})

describe("isNodeId", () => {
  // True only for a db-less, sanitized id: the metrics-node-id form.
  it("accepts a db-less node id", () => {
    assert.strictEqual(isNodeId("127-0-0-1-6379"), true)
  })

  it("rejects a db-suffixed connection id", () => {
    assert.strictEqual(isNodeId("127-0-0-1-6379-db0"), false)
    assert.strictEqual(isNodeId("valkey-7001-7001-db15"), false)
  })

  it("accepts a non-trailing -db<N> token (not a db suffix)", () => {
    assert.strictEqual(isNodeId("dbserver-db5-host-6379"), true)
  })

  it("accepts -db followed by non-digits (not a db suffix)", () => {
    assert.strictEqual(isNodeId("host-6379-dbx"), true)
  })

  it("accepts underscores", () => {
    assert.strictEqual(isNodeId("my_host-6379"), true)
  })

  it("rejects the empty string", () => {
    assert.strictEqual(isNodeId(""), false)
  })

  it("rejects ids outside the sanitized charset", () => {
    // `sanitizeUrl` collapses everything outside [a-zA-Z0-9_-], so these can
    // only arrive from a hand-crafted payload.
    assert.strictEqual(isNodeId("host.example-6379"), false)
    assert.strictEqual(isNodeId("host/6379"), false)
    assert.strictEqual(isNodeId("host 6379"), false)
  })
})

describe("normalizeEndpoint", () => {
  it("trims, lowercases and removes one trailing dot from the host, and parses the port", () => {
    assert.deepStrictEqual(normalizeEndpoint(" Cache.Internal. ", "6379"), { host: "cache.internal", port: 6379 })
    assert.deepStrictEqual(normalizeEndpoint("10.0.0.5", 7001), { host: "10.0.0.5", port: 7001 })
    assert.deepStrictEqual(normalizeEndpoint("[::1]", "6379"), { host: "[::1]", port: 6379 })
  })

  it("removes only one trailing dot", () => {
    assert.strictEqual(normalizeEndpoint("a.b..", "1").host, "a.b.")
  })

  it("rejects an empty host", () => {
    for (const host of ["", "   ", "."]) {
      assert.throws(() => normalizeEndpoint(host, "6379"), EndpointError)
    }
  })

  it("rejects ports that are not canonical decimal in 1..65535", () => {
    for (const port of ["0", "06379", " 6379", "6379 ", "0x18eb", "6379.0", "6.379e3", "65536", "-1", "", "abc", 0, 65536, 1.5, NaN]) {
      assert.throws(() => normalizeEndpoint("h", port as string | number), EndpointError, `port ${JSON.stringify(port)}`)
    }
    assert.strictEqual(normalizeEndpoint("h", "1").port, 1)
    assert.strictEqual(normalizeEndpoint("h", "65535").port, 65535)
    assert.strictEqual(normalizeEndpoint("h", 65535).port, 65535)
  })

  it("gives a message that names the field", () => {
    assert.throws(() => normalizeEndpoint("h", "06379"), /port/i)
    assert.throws(() => normalizeEndpoint("", "6379"), /host/i)
  })
})
