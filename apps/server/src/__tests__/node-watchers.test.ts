/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, beforeEach } from "node:test"
import assert from "node:assert"
import {
  subscribe,
  unsubscribe,
  unsubscribeAll,
  getOtherWatchers,
  getWatcherCount,
  _reset
} from "../node-watchers"

function mockWs(): any {
  return { send: () => {} }
}

describe("node-watchers", () => {
  beforeEach(() => {
    _reset()
  })

  describe("subscribe", () => {
    it("should add a ws to a connectionId", () => {
      const ws = mockWs()
      subscribe("node-1", ws)
      assert.strictEqual(getWatcherCount("node-1"), 1)
    })

    it("should handle multiple ws for the same connectionId", () => {
      const ws1 = mockWs()
      const ws2 = mockWs()
      subscribe("node-1", ws1)
      subscribe("node-1", ws2)
      assert.strictEqual(getWatcherCount("node-1"), 2)
    })

    it("should handle same ws subscribing to multiple connectionIds", () => {
      const ws = mockWs()
      subscribe("node-1", ws)
      subscribe("node-2", ws)
      assert.strictEqual(getWatcherCount("node-1"), 1)
      assert.strictEqual(getWatcherCount("node-2"), 1)
    })

    it("should not duplicate if same ws subscribes twice to the same connectionId", () => {
      const ws = mockWs()
      subscribe("node-1", ws)
      subscribe("node-1", ws)
      assert.strictEqual(getWatcherCount("node-1"), 1)
    })
  })

  describe("unsubscribe", () => {
    it("should remove a ws from a connectionId", () => {
      const ws = mockWs()
      subscribe("node-1", ws)
      unsubscribe("node-1", ws)
      assert.strictEqual(getWatcherCount("node-1"), 0)
    })

    it("should delete the key when the set becomes empty", () => {
      const ws = mockWs()
      subscribe("node-1", ws)
      unsubscribe("node-1", ws)
      // getWatcherCount returns 0 for missing keys
      assert.strictEqual(getWatcherCount("node-1"), 0)
      // Verify via getOtherWatchers returning empty
      assert.deepStrictEqual(getOtherWatchers("node-1", mockWs()), [])
    })

    it("should not affect other ws watching the same connectionId", () => {
      const ws1 = mockWs()
      const ws2 = mockWs()
      subscribe("node-1", ws1)
      subscribe("node-1", ws2)
      unsubscribe("node-1", ws1)
      assert.strictEqual(getWatcherCount("node-1"), 1)
    })

    it("should be a no-op for unknown connectionId", () => {
      const ws = mockWs()
      unsubscribe("unknown", ws)
      assert.strictEqual(getWatcherCount("unknown"), 0)
    })
  })

  describe("unsubscribeAll", () => {
    it("should remove ws from all connectionIds and return removed ids", () => {
      const ws = mockWs()
      subscribe("node-1", ws)
      subscribe("node-2", ws)
      subscribe("node-3", ws)

      const removedIds = unsubscribeAll(ws)
      assert.strictEqual(removedIds.length, 3)
      assert.ok(removedIds.includes("node-1"))
      assert.ok(removedIds.includes("node-2"))
      assert.ok(removedIds.includes("node-3"))
      assert.strictEqual(getWatcherCount("node-1"), 0)
      assert.strictEqual(getWatcherCount("node-2"), 0)
      assert.strictEqual(getWatcherCount("node-3"), 0)
    })

    it("should not affect other ws clients", () => {
      const ws1 = mockWs()
      const ws2 = mockWs()
      subscribe("node-1", ws1)
      subscribe("node-1", ws2)
      subscribe("node-2", ws1)

      unsubscribeAll(ws1)
      assert.strictEqual(getWatcherCount("node-1"), 1)
      assert.strictEqual(getWatcherCount("node-2"), 0)
    })

    it("should return empty array if ws has no subscriptions", () => {
      const ws = mockWs()
      const removedIds = unsubscribeAll(ws)
      assert.deepStrictEqual(removedIds, [])
    })

    it("should delete keys whose sets become empty", () => {
      const ws = mockWs()
      subscribe("node-1", ws)
      unsubscribeAll(ws)
      assert.strictEqual(getWatcherCount("node-1"), 0)
    })
  })

  describe("getOtherWatchers", () => {
    it("should return all watchers except the excluded one", () => {
      const ws1 = mockWs()
      const ws2 = mockWs()
      const ws3 = mockWs()
      subscribe("node-1", ws1)
      subscribe("node-1", ws2)
      subscribe("node-1", ws3)

      const others = getOtherWatchers("node-1", ws1)
      assert.strictEqual(others.length, 2)
      assert.ok(others.includes(ws2))
      assert.ok(others.includes(ws3))
      assert.ok(!others.includes(ws1))
    })

    it("should return empty array for unknown connectionId", () => {
      assert.deepStrictEqual(getOtherWatchers("unknown", mockWs()), [])
    })

    it("should return empty array if only the excluded ws is watching", () => {
      const ws = mockWs()
      subscribe("node-1", ws)
      assert.deepStrictEqual(getOtherWatchers("node-1", ws), [])
    })
  })

  describe("getWatcherCount", () => {
    it("should return 0 for unknown connectionId", () => {
      assert.strictEqual(getWatcherCount("unknown"), 0)
    })

    it("should return correct count", () => {
      const ws1 = mockWs()
      const ws2 = mockWs()
      subscribe("node-1", ws1)
      assert.strictEqual(getWatcherCount("node-1"), 1)
      subscribe("node-1", ws2)
      assert.strictEqual(getWatcherCount("node-1"), 2)
    })
  })
})
