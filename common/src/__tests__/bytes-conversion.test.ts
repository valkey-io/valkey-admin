import { describe, it } from "node:test"
import assert from "node:assert"
import { formatBytes } from "../bytes-conversion"

describe("formatBytes", () => {
  it("formats values below 1 TB in B, KB, MB and GB", () => {
    assert.strictEqual(formatBytes(0), "0 B")
    assert.strictEqual(formatBytes(512), "512 B")
    assert.strictEqual(formatBytes(1536), "1.5 KB")
    assert.strictEqual(formatBytes(1024 ** 3), "1 GB")
  })

  it("formats values of 1 TB and more in TB and PB", () => {
    assert.strictEqual(formatBytes(1024 ** 4), "1 TB")
    assert.strictEqual(formatBytes(1.25 * 1024 ** 4), "1.25 TB")
    assert.strictEqual(formatBytes(1024 ** 5), "1 PB")
  })

  it("formats values above 1024 PB in PB", () => {
    assert.strictEqual(formatBytes(2048 * 1024 ** 5), "2048 PB")
  })

  it("formats fractions of a byte in B", () => {
    assert.strictEqual(formatBytes(0.5), "0.5 B")
  })

  it("returns a dash for negative values", () => {
    assert.strictEqual(formatBytes(-1), "—")
  })
})
