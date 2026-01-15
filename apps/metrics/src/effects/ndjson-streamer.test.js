import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mockEnv, createAsyncIterator, createNdjsonLines } from "../__tests__/test-helpers.js"

// Mock node modules
vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn(),
    createReadStream: vi.fn(),
  },
}))

vi.mock("node:readline", () => ({
  default: {
    createInterface: vi.fn(),
  },
}))

describe("ndjson-streamer", () => {
  let fs
  let readline
  let cleanupEnv

  beforeEach(async () => {
    vi.resetModules()
    fs = (await import("node:fs")).default
    readline = (await import("node:readline")).default

    // Default mocks - only today's file exists, yesterday's throws ENOENT
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "")

    fs.createReadStream.mockImplementation((path) => {
      // Yesterday's file throws ENOENT
      if (!path.includes(`_${today}.ndjson`)) {
        const err = new Error("ENOENT: no such file or directory")
        err.code = "ENOENT"
        throw err
      }
      // Today's file returns stream
      return {
        destroy: vi.fn(),
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (cleanupEnv) {
      cleanupEnv()
      cleanupEnv = null
    }
  })

  describe("streamNdjson", () => {
    it("should read from yesterday and today files", async () => {
      const lines = createNdjsonLines(5)
      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")
      const result = await streamNdjson("test_prefix")

      // Should try to read both yesterday and today files (createReadStream called twice)
      expect(fs.createReadStream).toHaveBeenCalledTimes(2)
      expect(fs.createReadStream.mock.calls[0][0]).toContain("test_prefix_")
      expect(fs.createReadStream.mock.calls[1][0]).toContain("test_prefix_")

      // Both files should have different dates
      const file1 = fs.createReadStream.mock.calls[0][0]
      const file2 = fs.createReadStream.mock.calls[1][0]
      expect(file1).not.toBe(file2)

      // Should return data from today's file only (yesterday throws ENOENT)
      expect(result).toHaveLength(5)
    })

    it("should apply filterFn correctly", async () => {
      const lines = [
        JSON.stringify({ ts: 1000, metric: "test", value: 10 }),
        JSON.stringify({ ts: 1001, metric: "test", value: 20 }),
        JSON.stringify({ ts: 1002, metric: "test", value: 30 }),
      ]

      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")

      // Filter out values less than 25
      const result = await streamNdjson("test", {
        filterFn: (obj) => obj.value >= 25,
      })

      expect(result).toHaveLength(1)
      expect(result[0].value).toBe(30)
    })

    it("should apply mapFn transformation", async () => {
      const lines = [
        JSON.stringify({ ts: 1000, metric: "test", value: 10 }),
        JSON.stringify({ ts: 1001, metric: "test", value: 20 }),
      ]

      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")

      // Map to double the value
      const result = await streamNdjson("test", {
        mapFn: (obj) => ({ ...obj, value: obj.value * 2 }),
      })

      expect(result[0].value).toBe(20)
      expect(result[1].value).toBe(40)
    })

    it("should apply custom reducer", async () => {
      const lines = [
        JSON.stringify({ ts: 1000, metric: "test", value: 10 }),
        JSON.stringify({ ts: 1001, metric: "test", value: 20 }),
        JSON.stringify({ ts: 1002, metric: "test", value: 30 }),
      ]

      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")

      // Sum all values
      const result = await streamNdjson("test", {
        reducer: (acc, curr) => acc + curr.value,
        seed: 0,
      })

      expect(result).toBe(60)
    })

    it("should respect limit parameter", async () => {
      const lines = createNdjsonLines(100)
      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")
      const result = await streamNdjson("test", { limit: 10 })

      expect(result).toHaveLength(10)
    })

    it("should call finalize hook after reduction", async () => {
      const lines = createNdjsonLines(5)
      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")

      const finalize = vi.fn((acc) => [...acc, { finalized: true }])

      await streamNdjson("test", { finalize })

      expect(finalize).toHaveBeenCalledTimes(1)
    })

    it("should handle malformed JSON lines gracefully", async () => {
      const lines = [
        JSON.stringify({ ts: 1000, value: 10 }),
        "{ invalid json }",
        JSON.stringify({ ts: 1001, value: 20 }),
        "not json at all",
        JSON.stringify({ ts: 1002, value: 30 }),
      ]

      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")
      const result = await streamNdjson("test")

      // Should only return the 3 valid lines
      expect(result).toHaveLength(3)
      expect(result[0].value).toBe(10)
      expect(result[1].value).toBe(20)
      expect(result[2].value).toBe(30)
    })

    it("should return array when no options provided", async () => {
      const lines = createNdjsonLines(3)
      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")
      const result = await streamNdjson("test")

      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(3)
    })

    it("should skip empty lines", async () => {
      const lines = [
        JSON.stringify({ ts: 1000, value: 10 }),
        "",
        "   ",
        JSON.stringify({ ts: 1001, value: 20 }),
        "\t",
        JSON.stringify({ ts: 1002, value: 30 }),
      ]

      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")
      const result = await streamNdjson("test")

      expect(result).toHaveLength(3)
    })

    it("should correctly construct file paths with YYYYMMDD format", async () => {
      const lines = createNdjsonLines(1)
      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")
      await streamNdjson("my_metric")

      // Check that files follow the pattern: my_metric_YYYYMMDD.ndjson
      const file1 = fs.createReadStream.mock.calls[0][0]
      const file2 = fs.createReadStream.mock.calls[1][0]

      expect(file1).toMatch(/my_metric_\d{8}\.ndjson$/)
      expect(file2).toMatch(/my_metric_\d{8}\.ndjson$/)
    })

    it("should use DATA_DIR environment variable", async () => {
      cleanupEnv = mockEnv({ DATA_DIR: "/custom/data/dir" })

      const lines = createNdjsonLines(1)
      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const { streamNdjson } = await import("./ndjson-streamer.js")
      await streamNdjson("test")

      const file1 = fs.createReadStream.mock.calls[0][0]
      expect(file1).toContain("/custom/data/dir")
    })
  })

  describe("exported convenience functions", () => {
    it("should export named functions for each metric type", async () => {
      const lines = createNdjsonLines(1)
      readline.createInterface.mockReturnValue(createAsyncIterator(lines))

      const {
        memory_stats,
        info_cpu,
        slowlog_len,
        commandlog_slow,
        commandlog_large_reply,
        commandlog_large_request,
        monitor,
      } = await import("./ndjson-streamer.js")

      expect(typeof memory_stats).toBe("function")
      expect(typeof info_cpu).toBe("function")
      expect(typeof slowlog_len).toBe("function")
      expect(typeof commandlog_slow).toBe("function")
      expect(typeof commandlog_large_reply).toBe("function")
      expect(typeof commandlog_large_request).toBe("function")
      expect(typeof monitor).toBe("function")

      // Test that they work
      const result = await memory_stats()
      expect(Array.isArray(result)).toBe(true)
    })
  })
})
