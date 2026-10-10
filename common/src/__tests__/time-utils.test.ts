import { describe, it } from "node:test"
import assert from "node:assert"
import { formatExecutionTime } from "../time-utils"

describe("time-utils", () => {
  describe("formatExecutionTime", () => {
    it("formats sub-millisecond durations", () => {
      assert.strictEqual(formatExecutionTime(0.4), "< 1 ms")
      assert.strictEqual(formatExecutionTime(0.99), "< 1 ms")
    })

    it("formats millisecond durations", () => {
      assert.strictEqual(formatExecutionTime(1), "1 ms")
      assert.strictEqual(formatExecutionTime(12), "12 ms")
      assert.strictEqual(formatExecutionTime(12.04), "12 ms")
      assert.strictEqual(formatExecutionTime(12.34), "12.3 ms")
      assert.strictEqual(formatExecutionTime(500), "500 ms")
      assert.strictEqual(formatExecutionTime(999.9), "999.9 ms")
      assert.strictEqual(formatExecutionTime(999.96), "1.00 s")
    })

    it("formats second durations", () => {
      assert.strictEqual(formatExecutionTime(1000), "1.00 s")
      assert.strictEqual(formatExecutionTime(1540), "1.54 s")
      assert.strictEqual(formatExecutionTime(62340), "62.34 s")
    })
  })
})
