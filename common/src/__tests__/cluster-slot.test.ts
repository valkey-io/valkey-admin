import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { calculateClusterSlot, getHashTag, crc16 } from "../cluster-slot.ts"

describe("cluster-slot", () => {
  it("computes crc16 matching redis/valkey standard values", () => {
    // 123456789 -> 0x31C3
    assert.equal(crc16("123456789"), 0x31c3)
  })

  it("extracts hash tags correctly according to Valkey spec", () => {
    assert.equal(getHashTag("foo"), "foo")
    assert.equal(getHashTag("{user1}:profile"), "user1")
    assert.equal(getHashTag("user:{123}:orders:{456}"), "123")
    assert.equal(getHashTag("{}empty"), "{}empty") // empty brackets ignored
    assert.equal(getHashTag("{no_closing"), "{no_closing")
    assert.equal(getHashTag("no_opening}"), "no_opening}")
  })

  it("calculates cluster slot matching known Valkey cluster keyslots", () => {
    // 'foo' -> slot 12182 (standard redis/valkey cluster keyslot 'foo')
    assert.equal(calculateClusterSlot("foo"), 12182)

    // 'bar' -> slot 5061
    assert.equal(calculateClusterSlot("bar"), 5061)

    // hash tags: keys with same tag land in identical slot
    const slot1 = calculateClusterSlot("{user:100}:profile")
    const slot2 = calculateClusterSlot("{user:100}:settings")
    assert.equal(slot1, slot2)
    assert.equal(slot1, calculateClusterSlot("user:100"))
  })
})
