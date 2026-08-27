import { describe, it } from "node:test"
import assert from "node:assert"
import { isNodeId, toNodeId } from "../connection-id"

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
