import { describe, it, expect, vi, beforeEach } from "vitest"
import { createMockValkeyClient } from "../__tests__/test-helpers.js"

// Mock get-hot-slots
vi.mock("./get-hot-slots.js", () => ({
  getHotSlots: vi.fn(),
}))

describe("calculate-hot-keys (calculateHotKeysFromHotSlots)", () => {
  let client
  let getHotSlots

  beforeEach(async () => {
    vi.clearAllMocks()

    const getHotSlotsModule = await import("./get-hot-slots.js")
    getHotSlots = getHotSlotsModule.getHotSlots

    client = createMockValkeyClient()
  })

  describe("basic functionality", () => {
    it("should return top N hot keys across hot slots", async () => {
      // Mock 2 hot slots
      getHotSlots.mockResolvedValue([
        { slotId: 1000, cpuUsec: 10000 },
        { slotId: 2000, cpuUsec: 8000 },
      ])

      // Mock SCAN responses with realistic cursor values
      client.sendCommand.mockImplementation(async (cmd) => {
        if (cmd[0] === "SCAN") {
          const cursor = parseInt(cmd[1])

          // Slot 1000: Start at 1000, wrap to 0
          if (cursor === 1000) {
            return ["0", ["key1", "key2"]]  // Wraps around, 0 & 0x3FFF = 0 ≠ 1000
          }
          // Slot 2000: Start at 2000, wrap to 0
          else if (cursor === 2000) {
            return ["0", ["key3", "key4"]]  // Wraps around, 0 & 0x3FFF = 0 ≠ 2000
          }
        } else if (cmd[0] === "OBJECT" && cmd[1] === "FREQ") {
          const key = cmd[2]
          const freqs = { key1: 10, key2: 20, key3: 15, key4: 5 }
          return String(freqs[key] || 0)
        }
      })

      const { calculateHotKeysFromHotSlots } = await import("./calculate-hot-keys.js")
      const result = await calculateHotKeysFromHotSlots(client, 4)

      expect(result).toHaveLength(4)
      // Results should be in heap order (not necessarily sorted)
      expect(result.some(([key]) => key === "key1")).toBe(true)
      expect(result.some(([key]) => key === "key2")).toBe(true)
      expect(result.some(([key]) => key === "key3")).toBe(true)
      expect(result.some(([key]) => key === "key4")).toBe(true)
    })

    it("should use heap to maintain top-K efficiently", async () => {
      getHotSlots.mockResolvedValue([{ slotId: 1000, cpuUsec: 10000 }])

      client.sendCommand.mockImplementation(async (cmd) => {
        if (cmd[0] === "SCAN") {
          const cursor = parseInt(cmd[1])
          // Slot 1000: Return all keys in one batch, then wrap
          if (cursor === 1000) {
            return ["0", ["key1", "key2", "key3", "key4", "key5"]]  // 0 & 0x3FFF = 0 ≠ 1000
          }
        } else if (cmd[0] === "OBJECT" && cmd[1] === "FREQ") {
          const key = cmd[2]
          const freqs = { key1: 5, key2: 10, key3: 20, key4: 15, key5: 8 }
          return String(freqs[key] || 0)
        }
      })

      const { calculateHotKeysFromHotSlots } = await import("./calculate-hot-keys.js")
      const result = await calculateHotKeysFromHotSlots(client, 3)

      // Should only return top 3
      expect(result).toHaveLength(3)

      // Top 3 should be key3 (20), key4 (15), key2 (10)
      const keys = result.map(([key]) => key)
      expect(keys).toContain("key3")
      expect(keys).toContain("key4")
      expect(keys).toContain("key2")
      expect(keys).not.toContain("key1") // freq 5 is not in top 3
      expect(keys).not.toContain("key5") // freq 8 is not in top 3
    })

    it("should filter out keys with frequency <= 1", async () => {
      getHotSlots.mockResolvedValue([{ slotId: 1000, cpuUsec: 10000 }])

      client.sendCommand.mockImplementation(async (cmd) => {
        if (cmd[0] === "SCAN") {
          const cursor = parseInt(cmd[1])
          if (cursor === 1000) {
            return ["0", ["key1", "key2", "key3"]]  // 0 & 0x3FFF = 0 ≠ 1000
          }
        } else if (cmd[0] === "OBJECT" && cmd[1] === "FREQ") {
          const key = cmd[2]
          const freqs = { key1: 10, key2: 1, key3: 0 } // key2 and key3 should be filtered
          return String(freqs[key] || 0)
        }
      })

      const { calculateHotKeysFromHotSlots } = await import("./calculate-hot-keys.js")
      const result = await calculateHotKeysFromHotSlots(client, 10)

      // Only key1 should be returned (freq > 1)
      expect(result).toHaveLength(1)
      expect(result[0][0]).toBe("key1")
      expect(result[0][1]).toBe(10)
    })
  })

  describe("cursor pagination", () => {
    it("should handle cursor wrapping (cursor === 0)", async () => {
      getHotSlots.mockResolvedValue([{ slotId: 200, cpuUsec: 10000 }])

      client.sendCommand.mockImplementation(async (cmd) => {
        if (cmd[0] === "SCAN") {
          const cursor = parseInt(cmd[1])

          // Slot 200: Iterate through multiple cursors in the same slot
          if (cursor === 200) {
            // First iteration: stay in slot (200 + 16384 = 16584, 16584 & 0x3FFF = 200)
            return ["16584", ["key1", "key2"]]
          } else if (cursor === 16584) {
            // Second iteration: wrap around (cursor = 0 means complete)
            return ["0", ["key3", "key4"]]  // 0 & 0x3FFF = 0 ≠ 200, stops
          }
        } else if (cmd[0] === "OBJECT" && cmd[1] === "FREQ") {
          return "10"
        }
      })

      const { calculateHotKeysFromHotSlots } = await import("./calculate-hot-keys.js")
      const result = await calculateHotKeysFromHotSlots(client, 10)

      // Should have scanned and found all 4 keys
      expect(result.length).toBe(4)
      const keys = result.map(([key]) => key)
      expect(keys).toContain("key1")
      expect(keys).toContain("key2")
      expect(keys).toContain("key3")
      expect(keys).toContain("key4")
    })
  })

  describe("OBJECT FREQ calls", () => {
    it("should call OBJECT FREQ for each scanned key", async () => {
      getHotSlots.mockResolvedValue([{ slotId: 1000, cpuUsec: 10000 }])

      const freqCalls = []
      client.sendCommand.mockImplementation(async (cmd) => {
        if (cmd[0] === "SCAN") {
          const cursor = parseInt(cmd[1])
          if (cursor === 1000) {
            return ["0", ["key1", "key2", "key3"]]  // 0 & 0x3FFF = 0 ≠ 1000
          }
        } else if (cmd[0] === "OBJECT" && cmd[1] === "FREQ") {
          freqCalls.push(cmd[2]) // Record which key was queried
          return "10"
        }
      })

      const { calculateHotKeysFromHotSlots } = await import("./calculate-hot-keys.js")
      await calculateHotKeysFromHotSlots(client, 10)

      // Should have called OBJECT FREQ for each key
      expect(freqCalls).toContain("key1")
      expect(freqCalls).toContain("key2")
      expect(freqCalls).toContain("key3")
    })

    it("should handle multiple slots in parallel", async () => {
      getHotSlots.mockResolvedValue([
        { slotId: 1000, cpuUsec: 10000 },
        { slotId: 2000, cpuUsec: 9000 },
        { slotId: 3000, cpuUsec: 8000 },
      ])

      const scanCalls = []
      client.sendCommand.mockImplementation(async (cmd) => {
        if (cmd[0] === "SCAN") {
          const cursor = parseInt(cmd[1])
          scanCalls.push(cursor)  // Track which slots were scanned

          // Return slot-specific key and wrap to 0
          if (cursor === 1000) {
            return ["0", ["key1"]]  // 0 & 0x3FFF = 0 ≠ 1000 (stops)
          } else if (cursor === 2000) {
            return ["0", ["key2"]]  // 0 & 0x3FFF = 0 ≠ 2000 (stops)
          } else if (cursor === 3000) {
            return ["0", ["key3"]]  // 0 & 0x3FFF = 0 ≠ 3000 (stops)
          }
        } else if (cmd[0] === "OBJECT" && cmd[1] === "FREQ") {
          return "10"
        }
      })

      const { calculateHotKeysFromHotSlots } = await import("./calculate-hot-keys.js")
      await calculateHotKeysFromHotSlots(client, 10)

      // Should have scanned all 3 slots
      expect(scanCalls).toHaveLength(3)
      expect(scanCalls).toContain(1000)
      expect(scanCalls).toContain(2000)
      expect(scanCalls).toContain(3000)
    })
  })

  describe("edge cases", () => {
    it("should return empty array when no hot slots", async () => {
      getHotSlots.mockResolvedValue([])

      const { calculateHotKeysFromHotSlots } = await import("./calculate-hot-keys.js")
      const result = await calculateHotKeysFromHotSlots(client, 10)

      expect(result).toEqual([])
    })

    it("should handle slots with no keys", async () => {
      getHotSlots.mockResolvedValue([{ slotId: 1000, cpuUsec: 10000 }])

      client.sendCommand.mockImplementation(async (cmd) => {
        if (cmd[0] === "SCAN") {
          const cursor = parseInt(cmd[1])
          if (cursor === 1000) {
            // Return empty keys array, then wrap
            return ["0", []]  // 0 & 0x3FFF = 0 ≠ 1000
          }
        }
      })

      const { calculateHotKeysFromHotSlots } = await import("./calculate-hot-keys.js")
      const result = await calculateHotKeysFromHotSlots(client, 10)

      expect(result).toEqual([])
    })

    it("should respect count parameter", async () => {
      getHotSlots.mockResolvedValue([{ slotId: 1000, cpuUsec: 10000 }])

      client.sendCommand.mockImplementation(async (cmd) => {
        if (cmd[0] === "SCAN") {
          const cursor = parseInt(cmd[1])
          if (cursor === 1000) {
            return ["0", ["key1", "key2", "key3", "key4", "key5"]]  // 0 & 0x3FFF = 0 ≠ 1000
          }
        } else if (cmd[0] === "OBJECT" && cmd[1] === "FREQ") {
          const key = cmd[2]
          const freqs = { key1: 10, key2: 20, key3: 30, key4: 40, key5: 50 }
          return String(freqs[key] || 0)
        }
      })

      const { calculateHotKeysFromHotSlots } = await import("./calculate-hot-keys.js")

      // Request only top 2
      const result = await calculateHotKeysFromHotSlots(client, 2)

      expect(result).toHaveLength(2)

      // Should be top 2 (key5: 50, key4: 40)
      const keys = result.map(([key]) => key)
      expect(keys).toContain("key5")
      expect(keys).toContain("key4")
    })
  })
})
