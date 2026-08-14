import { describe, it } from "node:test"
import assert from "node:assert"
import { toScanPattern } from "../scan-pattern"

describe("toScanPattern", () => {
  it("wraps plain text with wildcards for substring matching", () => {
    assert.strictEqual(toScanPattern("hash"), "*hash*")
  })

  it("wraps multi-word input with wildcards", () => {
    assert.strictEqual(toScanPattern("user:session"), "*user:session*")
  })

  it("returns * for empty input", () => {
    assert.strictEqual(toScanPattern(""), "*")
  })

  it("passes through input containing *", () => {
    assert.strictEqual(toScanPattern("user:*"), "user:*")
  })

  it("passes through input containing ?", () => {
    assert.strictEqual(toScanPattern("session?"), "session?")
  })

  it("passes through input containing [", () => {
    assert.strictEqual(toScanPattern("key[0-9]"), "key[0-9]")
  })

  it("passes through input containing ]", () => {
    assert.strictEqual(toScanPattern("key[abc]"), "key[abc]")
  })

  it("passes through input with multiple glob characters", () => {
    assert.strictEqual(toScanPattern("user:*:session?"), "user:*:session?")
  })

  it("wraps input that looks like a glob but has no glob chars", () => {
    assert.strictEqual(toScanPattern("user:123:data"), "*user:123:data*")
  })
})
