import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
vi.mock("@valkey/valkey-glide", () => ({
  InfoOptions: {},
}))

import { createMockValkeyClient } from "../__tests__/test-helpers.js"
import { makeFetcher } from "./fetchers.js"

describe("fetchers", () => {
  let client
  let fetcher

  beforeEach(() => {
    client = createMockValkeyClient()
    fetcher = makeFetcher(client)
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    delete process.env.VALKEY_HOST
    delete process.env.VALKEY_PORT
  })

  describe("memory_stats", () => {
    it("should parse INFO MEMORY output correctly", async () => {
      client.info
        .mockResolvedValueOnce(
          `used_memory:800000
allocator_active:900000
allocator_resident:1000000
used_memory_peak:1100000
used_memory_dataset:500000
used_memory_overhead:300000
used_memory_dataset_perc:62.5%
mem_fragmentation_ratio:1.25
mem_fragmentation_bytes:250000
allocator_rss_ratio:1.11`,
        )
        .mockResolvedValueOnce("db0:keys=50,expires=0,avg_ttl=0")

      const result = await fetcher.memory_stats()

      expect(result.find((r) => r.metric === "used_memory")?.value).toBe(800000)
      expect(result.find((r) => r.metric === "peak_allocated")?.value).toBe(1100000)
      expect(result.find((r) => r.metric === "dataset_percentage")?.value).toBe(62.5)
      expect(result.find((r) => r.metric === "fragmentation")?.value).toBe(1.25)
      expect(result.find((r) => r.metric === "keys_count")?.value).toBe(50)
    })

    it("should derive bytes per key when key count is available", async () => {
      client.info
        .mockResolvedValueOnce(
          `used_memory_dataset:800000
used_memory:900000`,
        )
        .mockResolvedValueOnce("db0:keys=100,expires=0,avg_ttl=0")

      const result = await fetcher.memory_stats()

      expect(result.find((r) => r.metric === "keys_bytes_per_key")?.value).toBe(8000)
    })

    it("should filter out non-numeric values", async () => {
      client.info
        .mockResolvedValueOnce(
          `used_memory:800000
allocator_active:not-a-number
mem_fragmentation_ratio:1.25`,
        )
        .mockResolvedValueOnce("")

      const result = await fetcher.memory_stats()

      expect(result).toHaveLength(2)
      expect(result.find((r) => r.metric === "used_memory")?.value).toBe(800000)
      expect(result.find((r) => r.metric === "fragmentation")?.value).toBe(1.25)
    })

    it("should return empty rows when INFO MEMORY is empty", async () => {
      client.info.mockResolvedValueOnce("").mockResolvedValueOnce("")

      const result = await fetcher.memory_stats()

      expect(result).toEqual([])
    })

    it("should add timestamp to all rows", async () => {
      client.info
        .mockResolvedValueOnce("used_memory:100\nused_memory_peak:200")
        .mockResolvedValueOnce("")

      const result = await fetcher.memory_stats()

      expect(result.every((r) => r.ts === Date.now())).toBe(true)
    })

    it("should normalize cluster-mode memory responses to the local node", async () => {
      process.env.VALKEY_HOST = "valkey-5.valkey-headless.valkey.svc.cluster.local"
      process.env.VALKEY_PORT = "6379"
      client.info
        .mockResolvedValueOnce({
          "valkey-0.valkey-headless.valkey.svc.cluster.local:6379": "used_memory:100",
          "valkey-5.valkey-headless.valkey.svc.cluster.local:6379": "used_memory:200",
        })
        .mockResolvedValueOnce({
          "valkey-0.valkey-headless.valkey.svc.cluster.local:6379": "db0:keys=1,expires=0,avg_ttl=0",
          "valkey-5.valkey-headless.valkey.svc.cluster.local:6379": "db0:keys=2,expires=0,avg_ttl=0",
        })

      const result = await fetcher.memory_stats()

      expect(result).toHaveLength(2)
      expect(result.find((r) => r.metric === "used_memory")?.value).toBe(200)
      expect(result.find((r) => r.metric === "keys_count")?.value).toBe(2)
    })
  })

  describe("info_cpu", () => {
    it("should parse INFO CPU output correctly", async () => {
      client.info.mockResolvedValue(
        `used_cpu_sys:10.5
        used_cpu_user:20.3
        used_cpu_sys_children:0.1`,
      )

      const result = await fetcher.info_cpu()

      expect(result).toHaveLength(3)
      expect(result.find((r) => r.metric === "used_cpu_sys").value).toBe(10.5)
      expect(result.find((r) => r.metric === "used_cpu_user").value).toBe(20.3)
      expect(
        result.find((r) => r.metric === "used_cpu_sys_children").value,
      ).toBe(0.1)
    })

    it("should filter out section headers", async () => {
      client.info.mockResolvedValue(
        `# CPU
        used_cpu_sys:10.5
        # Another Section
        used_cpu_user:20.3`,
      )

      const result = await fetcher.info_cpu()

      // Should only have 2 metrics, not the headers
      expect(result).toHaveLength(2)
      expect(result.every((r) => !r.metric.startsWith("#"))).toBe(true)
    })

    it("should filter out empty lines", async () => {
      client.info.mockResolvedValue(
        `used_cpu_sys:10.5

        used_cpu_user:20.3

        used_cpu_sys_children:0.1`,
      )

      const result = await fetcher.info_cpu()

      expect(result).toHaveLength(3)
    })

    it("should handle CRLF and LF line endings", async () => {
      // Test with CRLF
      client.info.mockResolvedValue(
        "used_cpu_sys:10.5\r\nused_cpu_user:20.3\r\n",
      )
      let result = await fetcher.info_cpu()
      expect(result).toHaveLength(2)

      // Test with LF
      client.info.mockResolvedValue("used_cpu_sys:10.5\nused_cpu_user:20.3\n")
      result = await fetcher.info_cpu()
      expect(result).toHaveLength(2)
    })

    it("should filter non-numeric values", async () => {
      client.info.mockResolvedValue(
        `used_cpu_sys:10.5
        invalid_metric:not-a-number
        used_cpu_user:20.3
        another_invalid:abc`,
      )

      const result = await fetcher.info_cpu()

      expect(result).toHaveLength(2)
      expect(result.find((r) => r.metric === "used_cpu_sys")).toBeTruthy()
      expect(result.find((r) => r.metric === "used_cpu_user")).toBeTruthy()
      expect(result.find((r) => r.metric === "invalid_metric")).toBeFalsy()
    })

    it("should normalize cluster-mode info responses to the local node", async () => {
      process.env.VALKEY_HOST = "valkey-5.valkey-headless.valkey.svc.cluster.local"
      process.env.VALKEY_PORT = "6379"
      client.info.mockResolvedValue({
        "valkey-0.valkey-headless.valkey.svc.cluster.local:6379": "used_cpu_sys:1.5",
        "valkey-5.valkey-headless.valkey.svc.cluster.local:6379": "used_cpu_sys:2.5",
      })

      const result = await fetcher.info_cpu()

      expect(result).toHaveLength(1)
      expect(result[0].metric).toBe("used_cpu_sys")
      expect(result[0].value).toBe(2.5)
    })
  })

  describe("commandlog_slow", () => {
    it("should parse slow command log entries", async () => {
      const mockEntries = [
        [1, 1672531200, 1500, ["GET", "mykey"], "127.0.0.1:6379", "client1"],
        [
          2,
          1672531201,
          2000,
          ["SET", "mykey", "value"],
          "127.0.0.1:6379",
          "client2",
        ],
      ]

      client.customCommand.mockResolvedValue(mockEntries)

      const result = await fetcher.commandlog_slow(50)

      expect(client.customCommand).toHaveBeenCalledWith([
        "COMMANDLOG",
        "GET",
        "50",
        "slow",
      ])
      expect(result).toHaveLength(1)
      expect(result[0].ts).toBe(Date.now())
      expect(result[0].metric).toBe("commandlog_slow")
      expect(result[0].values).toHaveLength(2)
    })

    it("should use correct COMMANDLOG type constant", async () => {
      client.customCommand.mockResolvedValue([])

      await fetcher.commandlog_slow()

      expect(client.customCommand).toHaveBeenCalledWith(
        expect.arrayContaining(["slow"]),
      )
    })

    it("should return single row with array of values", async () => {
      const mockEntries = [
        [1, 1672531200, 1500, ["GET", "key"], "127.0.0.1:6379", "client"],
      ]

      client.customCommand.mockResolvedValue(mockEntries)

      const result = await fetcher.commandlog_slow()

      expect(result).toHaveLength(1)
      expect(Array.isArray(result[0].values)).toBe(true)
      expect(result[0].values).toHaveLength(1)
    })

    it("should handle empty response", async () => {
      client.customCommand.mockResolvedValue([])

      const result = await fetcher.commandlog_slow()

      expect(result).toHaveLength(1)
      expect(result[0].values).toHaveLength(0)
    })
  })

  describe("commandlog_large_reply", () => {
    it("should parse large reply entries", async () => {
      const mockEntries = [
        [1, 1672531200, 1024000, ["LRANGE", "list", "0", "-1"], "", ""],
      ]

      client.customCommand.mockResolvedValue(mockEntries)

      const result = await fetcher.commandlog_large_reply(50)

      const callArgs = client.customCommand.mock.calls[0][0]
      expect(callArgs[0]).toBe("COMMANDLOG")
      expect(callArgs[1]).toBe("GET")
      expect(callArgs[2]).toBe("50")
      expect(callArgs[3]).toBe("large-reply")
      expect(result[0].metric).toBe("commandlog_large_reply")
      expect(result[0].values).toHaveLength(1)
    })

    it("should use correct constant", async () => {
      client.customCommand.mockResolvedValue([])

      await fetcher.commandlog_large_reply()

      const callArgs = client.customCommand.mock.calls[0][0]
      expect(callArgs).toContain("large-reply")
    })
  })

  describe("commandlog_large_request", () => {
    it("should parse large request entries", async () => {
      const mockEntries = [
        [
          1,
          1672531200,
          1024000,
          ["SET", "key", "very-long-value"],
          "127.0.0.1:6379",
          "client",
        ],
      ]

      client.customCommand.mockResolvedValue(mockEntries)

      const result = await fetcher.commandlog_large_request(50)

      const callArgs = client.customCommand.mock.calls[0][0]
      expect(callArgs[0]).toBe("COMMANDLOG")
      expect(callArgs[1]).toBe("GET")
      expect(callArgs[2]).toBe("50")
      expect(callArgs[3]).toBe("large-request")
      expect(result[0].metric).toBe("commandlog_large_request")
      expect(result[0].values).toHaveLength(1)
    })

    it("should use correct constant", async () => {
      client.customCommand.mockResolvedValue([])

      await fetcher.commandlog_large_request()

      const callArgs = client.customCommand.mock.calls[0][0]
      expect(callArgs).toContain("large-request")
    })
  })
})
