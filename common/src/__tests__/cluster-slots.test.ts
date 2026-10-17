import { describe, it } from "node:test"
import assert from "node:assert"
import { crc16, getHashTag, getKeySlot, TOTAL_CLUSTER_SLOTS } from "../cluster-slots"

describe("cluster hash slots", () => {
  it("defines TOTAL_CLUSTER_SLOTS as 16384", () => {
    assert.strictEqual(TOTAL_CLUSTER_SLOTS, 16384)
  })

  describe("getHashTag", () => {
    it("returns key itself when no braces exist", () => {
      assert.strictEqual(getHashTag("foo"), "foo")
      assert.strictEqual(getHashTag("user:profile:100"), "user:profile:100")
    })

    it("returns key when braces are empty {}", () => {
      assert.strictEqual(getHashTag("{}:foo"), "{}:foo")
      assert.strictEqual(getHashTag("foo{}bar"), "foo{}bar")
    })

    it("returns key when only opening brace exists", () => {
      assert.strictEqual(getHashTag("{foo"), "{foo")
      assert.strictEqual(getHashTag("foo{bar"), "foo{bar")
    })

    it("returns key when only closing brace exists", () => {
      assert.strictEqual(getHashTag("foo}"), "foo}")
      assert.strictEqual(getHashTag("foo}bar"), "foo}bar")
    })

    it("extracts content between first { and first subsequent }", () => {
      assert.strictEqual(getHashTag("{user100}:profile"), "user100")
      assert.strictEqual(getHashTag("prefix:{tenant_1}:data"), "tenant_1")
      assert.strictEqual(getHashTag("{a}b{c}"), "a")
      assert.strictEqual(getHashTag("{nested{inner}}"), "nested{inner")
    })
  })

  describe("crc16 checksum", () => {
    it("computes crc16 checksum matching standard vectors", () => {
      const encoder = new TextEncoder()
      assert.strictEqual(crc16(encoder.encode("123456789")), 0x31c3)
    })
  })

  describe("getKeySlot", () => {
    it("matches standard Redis / Valkey CLUSTER KEYSLOT vectors", () => {
      // Known CLUSTER KEYSLOT reference values:
      assert.strictEqual(getKeySlot("foo"), 12182)
      assert.strictEqual(getKeySlot("test"), 6918)
      assert.strictEqual(getKeySlot("hello"), 866)
      assert.strictEqual(getKeySlot("user100"), 8831)
    })

    it("hashes the hash tag when present and non-empty", () => {
      assert.strictEqual(getKeySlot("{user100}:profile"), getKeySlot("user100"))
      assert.strictEqual(getKeySlot("{user100}:settings"), getKeySlot("user100"))
      assert.strictEqual(getKeySlot("{user100}:orders:active"), getKeySlot("user100"))
      assert.strictEqual(getKeySlot("prefix:{my-tag}:suffix"), getKeySlot("my-tag"))
    })

    it("hashes the whole key when braces are empty", () => {
      assert.strictEqual(getKeySlot("{}:test"), getKeySlot("{}:test"))
      assert.notStrictEqual(getKeySlot("{}:test"), getKeySlot("test"))
    })

    it("always produces a slot between 0 and 16383", () => {
      const testKeys = [
        "", "a", "alpha:beta:gamma", "very:long:key:with:many:segments:and:numbers:1234567890",
        "{tag}", "{tag}:data", "utf8:🔥:🚀", "key\0with\0nulls",
      ]
      for (const k of testKeys) {
        const slot = getKeySlot(k)
        assert.ok(slot >= 0 && slot < 16384, `Slot ${slot} out of range for key "${k}"`)
      }
    })
  })
})
