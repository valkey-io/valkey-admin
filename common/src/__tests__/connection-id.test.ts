import { describe, it } from "node:test"
import assert from "node:assert"
import { toNodeId, isValidPort } from "../connection-id"

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

describe("isValidPort", () => {
  it("accepts integers in 1-65535", () => {
    assert.strictEqual(isValidPort("1"), true)
    assert.strictEqual(isValidPort("6379"), true)
    assert.strictEqual(isValidPort("65535"), true)
  })

  it("rejects 0 (auto-assign / TCP-disabled, not a connectable port)", () => {
    assert.strictEqual(isValidPort("0"), false)
  })

  it("rejects out-of-range, negative, decimal, empty and non-numeric", () => {
    assert.strictEqual(isValidPort("65536"), false)
    assert.strictEqual(isValidPort("99999"), false)
    assert.strictEqual(isValidPort("-1"), false)
    assert.strictEqual(isValidPort("6379.5"), false)
    assert.strictEqual(isValidPort(""), false)
    assert.strictEqual(isValidPort("abc"), false)
    assert.strictEqual(isValidPort("  "), false)
  })
})
