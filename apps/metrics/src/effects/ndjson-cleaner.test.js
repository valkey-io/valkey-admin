import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { METRICS_EVICTION_POLICY } from "../../../../common/src/constants.js"

vi.mock("node:fs", () => ({
  default: {
    promises: {
      readdir: vi.fn(),
      stat: vi.fn(),
      unlink: vi.fn(),
    },
  },
}))

vi.mock("../utils/logger.js", () => {
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
  return { createLogger: () => logger }
})

describe("ndjson-cleaner", () => {
  let fs
  let cfg

  beforeEach(async () => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2025-06-15T12:00:00.000Z"))

    fs = (await import("node:fs")).default

    fs.promises.readdir.mockResolvedValue([])
    fs.promises.stat.mockResolvedValue({ birthtime: new Date("2025-06-15") })
    fs.promises.unlink.mockResolvedValue(undefined)

    cfg = {
      server: { data_dir: "/app/data" },
      storage: { retention_days: 30 },
    }
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe("retention policy", () => {
    it("deletes only expired .ndjson files", async () => {
      // 2025-06-15 now, 30-day retention → cutoff = 2025-05-16
      // memory has old birthtime (expired), cpu has recent birthtime (kept)
      fs.promises.readdir.mockResolvedValue([
        "memory_20250501.ndjson",
        "cpu_20250610.ndjson",
      ])
      fs.promises.stat.mockImplementation((filePath) => {
        if (filePath.endsWith("memory_20250501.ndjson")) return Promise.resolve({ birthtime: new Date("2025-05-01") })
        return Promise.resolve({ birthtime: new Date("2025-06-10") })
      })

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      await vi.advanceTimersByTimeAsync(0)

      expect(fs.promises.unlink).toHaveBeenCalledTimes(1)
      expect(fs.promises.unlink).toHaveBeenCalledWith("/app/data/memory_20250501.ndjson")

      stopNdjsonCleaner()
    })

    it("keeps .ndjson files with recent birthtime", async () => {
      fs.promises.readdir.mockResolvedValue([
        "notes.ndjson",
        "backup.ndjson",
      ])
      fs.promises.stat.mockResolvedValue({ birthtime: new Date("2025-06-14") })

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      await vi.advanceTimersByTimeAsync(0)

      expect(fs.promises.unlink).not.toHaveBeenCalled()

      stopNdjsonCleaner()
    })

    it("handles empty directory", async () => {
      fs.promises.readdir.mockResolvedValue([])

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      await vi.advanceTimersByTimeAsync(0)

      expect(fs.promises.unlink).not.toHaveBeenCalled()

      stopNdjsonCleaner()
    })

    it("keeps file exactly at cutoff date", async () => {
      // now = 2025-06-15T12:00:00.000Z, retention_days = 30 → cutoff = 2025-05-16T12:00:00.000Z
      // File with birthtime at cutoff should be kept, file before cutoff should be deleted
      fs.promises.readdir.mockResolvedValue([
        "at_cutoff.ndjson",
        "before_cutoff.ndjson",
      ])
      fs.promises.stat.mockImplementation((filePath) => {
        if (filePath.endsWith("at_cutoff.ndjson")) {
          return Promise.resolve({ birthtime: new Date("2025-05-16T12:00:00.000Z") })
        }
        return Promise.resolve({ birthtime: new Date("2025-05-16T11:59:59.999Z") })
      })

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      await vi.advanceTimersByTimeAsync(0)

      // Only before_cutoff should be deleted (< cutoff), at_cutoff should be kept (== cutoff)
      expect(fs.promises.unlink).toHaveBeenCalledTimes(1)
      expect(fs.promises.unlink).toHaveBeenCalledWith("/app/data/before_cutoff.ndjson")

      stopNdjsonCleaner()
    })
  })

  describe("timer behavior", () => {
    it("runs cleanup immediately on setup", async () => {
      fs.promises.readdir.mockResolvedValue(["memory_20250101.ndjson"])

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      await vi.advanceTimersByTimeAsync(0)

      expect(fs.promises.readdir).toHaveBeenCalledTimes(1)
      expect(fs.promises.readdir).toHaveBeenCalledWith("/app/data")

      stopNdjsonCleaner()
    })

    it("runs cleanup again after METRICS_EVICTION_POLICY.INTERVAL", async () => {
      fs.promises.readdir.mockResolvedValue([])

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      await vi.advanceTimersByTimeAsync(0)
      expect(fs.promises.readdir).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(METRICS_EVICTION_POLICY.INTERVAL)
      expect(fs.promises.readdir).toHaveBeenCalledTimes(2)

      stopNdjsonCleaner()
    })

    it("exhaustMap prevents overlap when cleanup is slow", async () => {
      // Make readdir resolve slowly — longer than the interval
      // Use a short interval for this test to avoid massive timer advances
      vi.resetModules()

      // Re-mock with slow readdir
      fs = (await import("node:fs")).default
      fs.promises.readdir.mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => resolve([]), METRICS_EVICTION_POLICY.INTERVAL + 1000)
        }),
      )

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      // Advance through 3 intervals — with exhaustMap, only one readdir should be active
      await vi.advanceTimersByTimeAsync(METRICS_EVICTION_POLICY.INTERVAL * 3)

      // exhaustMap should prevent concurrent calls — readdir should have been called
      // fewer times than if every tick triggered a new call
      expect(fs.promises.readdir.mock.calls.length).toBeGreaterThanOrEqual(1)
      expect(fs.promises.readdir.mock.calls.length).toBeLessThanOrEqual(3)

      stopNdjsonCleaner()
    })
  })

  describe("lifecycle", () => {
    it("stopNdjsonCleaner stops the timer", async () => {
      fs.promises.readdir.mockResolvedValue([])

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      await vi.advanceTimersByTimeAsync(0)

      const callsBeforeStop = fs.promises.readdir.mock.calls.length

      stopNdjsonCleaner()

      await vi.advanceTimersByTimeAsync(METRICS_EVICTION_POLICY.INTERVAL * 3)

      expect(fs.promises.readdir.mock.calls.length).toBe(callsBeforeStop)
      expect(fs.promises.unlink).not.toHaveBeenCalled()
    })

    it("handles readdir error gracefully and continues on next interval", async () => {
      fs.promises.readdir
        .mockRejectedValueOnce(new Error("EACCES: permission denied"))
        .mockResolvedValueOnce(["memory_20250101.ndjson"])
      fs.promises.stat.mockResolvedValue({ birthtime: new Date("2025-01-01") })

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      // First tick — readdir rejects
      await vi.advanceTimersByTimeAsync(0)

      expect(fs.promises.readdir).toHaveBeenCalledTimes(1)
      expect(fs.promises.unlink).not.toHaveBeenCalled()

      // Second tick — readdir succeeds, should still process normally
      await vi.advanceTimersByTimeAsync(METRICS_EVICTION_POLICY.INTERVAL)

      expect(fs.promises.readdir).toHaveBeenCalledTimes(2)
      expect(fs.promises.unlink).toHaveBeenCalledTimes(1)

      stopNdjsonCleaner()
    })

    it("logs error when individual unlink fails", async () => {
      fs.promises.readdir.mockResolvedValue([
        "old_a.ndjson",
        "old_b.ndjson",
      ])
      fs.promises.stat.mockResolvedValue({ birthtime: new Date("2025-01-01") })
      fs.promises.unlink
        .mockRejectedValueOnce(new Error("EACCES"))
        .mockResolvedValueOnce(undefined)

      const { createLogger } = await import("../utils/logger.js")
      const log = createLogger()

      const { setupNdjsonCleaner, stopNdjsonCleaner } = await import("./ndjson-cleaner.js")
      setupNdjsonCleaner(cfg)

      await vi.advanceTimersByTimeAsync(0)

      expect(fs.promises.unlink).toHaveBeenCalledTimes(2)
      expect(log.error).toHaveBeenCalledTimes(1)

      stopNdjsonCleaner()
    })
  })
})
