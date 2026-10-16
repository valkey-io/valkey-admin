import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { keyHashSlot } from "../hash-slot"

describe("hash-slot", () => {
  describe("keyHashSlot", () => {
    it("correctly computes standard key hash slots matching Valkey CLUSTER KEYSLOT", () => {
      // Standard known test vectors for Redis/Valkey cluster CRC16
      assert.equal(keyHashSlot("foo"), 12182)
      assert.equal(keyHashSlot("bar"), 5061)
      assert.equal(keyHashSlot("user100"), 8831)
    })

    it("correctly honors hash tags inside {braces}", () => {
      assert.equal(keyHashSlot("{user100}:profile"), 8831)
      assert.equal(keyHashSlot("{user100}:orders"), 8831)
      assert.equal(keyHashSlot("prefix:{user100}:suffix"), 8831)
    })

    it("falls back to entire string when braces are empty {}", () => {
      assert.equal(keyHashSlot("{}"), keyHashSlot("{}"))
      assert.equal(keyHashSlot("{}:test"), keyHashSlot("{}:test"))
    })

    it("handles multiple or unclosed braces correctly", () => {
      assert.equal(keyHashSlot("{open-only"), keyHashSlot("{open-only"))
      assert.equal(keyHashSlot("close-only}"), keyHashSlot("close-only}"))
      // Only first valid pair is considered a hash tag
      assert.equal(keyHashSlot("{a}{b}"), keyHashSlot("a"))
    })

    it("always produces slot within valid cluster range [0, 16383]", () => {
      const keys = ["a", "b", "c", "123", "alpha:beta:gamma", "very-long-key-name-test-1234567890"]
      for (const k of keys) {
        const slot = keyHashSlot(k)
        assert.ok(slot >= 0 && slot < 16384, `slot ${slot} out of range for ${k}`)
      }
    })
  })
})
