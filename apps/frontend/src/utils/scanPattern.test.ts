import { describe, it, expect } from "vitest"
import { toScanPattern } from "./scanPattern"

describe("toScanPattern", () => {
  it("wraps plain text with wildcards for substring matching", () => {
    expect(toScanPattern("hash")).toBe("*hash*")
  })

  it("wraps multi-word input with wildcards", () => {
    expect(toScanPattern("user:session")).toBe("*user:session*")
  })

  it("returns * for empty input", () => {
    expect(toScanPattern("")).toBe("*")
  })

  it("passes through input containing *", () => {
    expect(toScanPattern("user:*")).toBe("user:*")
  })

  it("passes through input containing ?", () => {
    expect(toScanPattern("session?")).toBe("session?")
  })

  it("passes through input containing [", () => {
    expect(toScanPattern("key[0-9]")).toBe("key[0-9]")
  })

  it("passes through input containing ]", () => {
    expect(toScanPattern("key[abc]")).toBe("key[abc]")
  })

  it("passes through input with multiple glob characters", () => {
    expect(toScanPattern("user:*:session?")).toBe("user:*:session?")
  })

  it("wraps input that looks like a glob but has no glob chars", () => {
    expect(toScanPattern("user:123:data")).toBe("*user:123:data*")
  })
})
