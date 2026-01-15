import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { Subject } from "rxjs"
import { createMockValkeyClient, createMockConfig } from "./__tests__/test-helpers.js"

// Mock dependencies
vi.mock("./effects/fetchers.js", () => ({
  makeFetcher: vi.fn(),
}))

vi.mock("./effects/monitor-stream.js", () => ({
  makeMonitorStream: vi.fn(),
}))

vi.mock("./effects/ndjson-writer.js", () => ({
  makeNdjsonWriter: vi.fn(),
}))

vi.mock("./epics/collector-rx.js", () => ({
  startCollector: vi.fn(),
}))

describe("init-collectors", () => {
  let makeFetcher
  let makeMonitorStream
  let makeNdjsonWriter
  let startCollector
  let client
  let config

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"))

    // Get mocked modules
    const fetchersModule = await import("./effects/fetchers.js")
    const monitorStreamModule = await import("./effects/monitor-stream.js")
    const ndjsonWriterModule = await import("./effects/ndjson-writer.js")
    const collectorRxModule = await import("./epics/collector-rx.js")

    makeFetcher = fetchersModule.makeFetcher
    makeMonitorStream = monitorStreamModule.makeMonitorStream
    makeNdjsonWriter = ndjsonWriterModule.makeNdjsonWriter
    startCollector = collectorRxModule.startCollector

    // Setup client and config
    client = createMockValkeyClient()
    config = createMockConfig({
      epics: [
        {
          name: "cpu",
          type: "info_cpu",
          poll_ms: 1000,
          file_prefix: "cpu",
        },
        {
          name: "memory",
          type: "memory_stats",
          poll_ms: 2000,
          file_prefix: "memory",
        },
      ],
    })

    // Setup default mocks
    const mockWriter = {
      appendRows: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    }
    makeNdjsonWriter.mockReturnValue(mockWriter)

    const mockFetcher = {
      info_cpu: vi.fn().mockResolvedValue([{ ts: Date.now(), metric: "cpu", value: 10 }]),
      memory_stats: vi.fn().mockResolvedValue([{ ts: Date.now(), metric: "mem", value: 100 }]),
    }
    makeFetcher.mockReturnValue(mockFetcher)

    startCollector.mockReturnValue(vi.fn()) // Returns a stopper function
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("setupCollectors", () => {
    it("should initialize collectors for all non-monitor epics", async () => {
      const { setupCollectors } = await import("./init-collectors.js")

      await setupCollectors(client, config)

      expect(makeFetcher).toHaveBeenCalledWith(client)
      expect(startCollector).toHaveBeenCalledTimes(2)
    })

    it("should skip epics without matching fetcher type", async () => {
      const configWithUnknown = createMockConfig({
        epics: [
          { name: "cpu", type: "info_cpu", poll_ms: 1000 },
          { name: "unknown", type: "unknown_type", poll_ms: 1000 },
        ],
      })

      const mockFetcher = {
        info_cpu: vi.fn().mockResolvedValue([]),
        // unknown_type doesn't exist
      }
      makeFetcher.mockReturnValue(mockFetcher)

      const { setupCollectors } = await import("./init-collectors.js")

      await setupCollectors(client, configWithUnknown)

      // Only one collector should be started (cpu)
      expect(startCollector).toHaveBeenCalledTimes(1)
      expect(startCollector).toHaveBeenCalledWith(
        expect.objectContaining({ name: "cpu" }),
      )
    })

    it("should create ndjson writers with correct paths", async () => {
      const { setupCollectors } = await import("./init-collectors.js")

      await setupCollectors(client, config)

      expect(makeNdjsonWriter).toHaveBeenCalledWith({
        dataDir: "/test/data",
        filePrefix: "cpu",
      })

      expect(makeNdjsonWriter).toHaveBeenCalledWith({
        dataDir: "/test/data",
        filePrefix: "memory",
      })
    })

    it("should update collector metadata on initialization", async () => {
      const { setupCollectors, getCollectorMeta } = await import("./init-collectors.js")

      await setupCollectors(client, config)

      const cpuMeta = getCollectorMeta("cpu")
      expect(cpuMeta.isRunning).toBe(true)
      expect(cpuMeta.startedAt).toBe(Date.now())
      expect(cpuMeta.nextCycleAt).toBe(Date.now() + 1000) // poll_ms = 1000
      expect(cpuMeta.lastUpdatedAt).toBe(Date.now()) // Updated after initial fetch
    })

    it("should perform initial fetch before starting polling", async () => {
      const mockFetcher = {
        info_cpu: vi.fn().mockResolvedValue([{ ts: Date.now(), metric: "cpu", value: 10 }]),
      }
      makeFetcher.mockReturnValue(mockFetcher)

      const configWithOneCpu = createMockConfig({
        epics: [{ name: "cpu", type: "info_cpu", poll_ms: 1000 }],
      })

      const { setupCollectors } = await import("./init-collectors.js")

      await setupCollectors(client, configWithOneCpu)

      // Fetcher should be called at least once for initial fetch
      expect(mockFetcher.info_cpu).toHaveBeenCalled()

      // Writer should have been called with initial data
      const writer = makeNdjsonWriter.mock.results[0].value
      expect(writer.appendRows).toHaveBeenCalled()
    })

    it("should filter out monitor epic", async () => {
      const configWithMonitor = createMockConfig({
        epics: [
          { name: "cpu", type: "info_cpu", poll_ms: 1000 },
          { name: "monitor", type: "monitor_stream", poll_ms: 1000 },
        ],
      })

      const mockFetcher = {
        info_cpu: vi.fn().mockResolvedValue([]),
        monitor_stream: vi.fn().mockResolvedValue([]),
      }
      makeFetcher.mockReturnValue(mockFetcher)

      const { setupCollectors } = await import("./init-collectors.js")

      await setupCollectors(client, configWithMonitor)

      // Only cpu should be started, not monitor
      expect(startCollector).toHaveBeenCalledTimes(1)
      expect(startCollector).toHaveBeenCalledWith(
        expect.objectContaining({ name: "cpu" }),
      )
    })
  })

  describe("updateCollectorMeta and getCollectorMeta", () => {
    it("should create new metadata object if none exists", async () => {
      // Reset modules to get fresh state
      vi.resetModules()
      const { getCollectorMeta } = await import("./init-collectors.js")

      // Access internal updateCollectorMeta through setupCollectors
      const mockFetcher = {
        test_collector: vi.fn().mockResolvedValue([]),
      }
      makeFetcher.mockReturnValue(mockFetcher)

      const testConfig = createMockConfig({
        epics: [{ name: "test_collector", type: "test_collector", poll_ms: 1000 }],
      })

      const { setupCollectors } = await import("./init-collectors.js")
      await setupCollectors(client, testConfig)

      const meta = getCollectorMeta("test_collector")
      expect(meta).toBeDefined()
      expect(meta.isRunning).toBe(true)
    })

    it("should merge partial updates into existing metadata", async () => {
      vi.resetModules()

      const mockFetcher = {
        test_collector: vi.fn().mockResolvedValue([]),
      }
      makeFetcher.mockReturnValue(mockFetcher)

      const testConfig = createMockConfig({
        epics: [{ name: "test_collector", type: "test_collector", poll_ms: 1000 }],
      })

      const { setupCollectors, getCollectorMeta } = await import("./init-collectors.js")
      await setupCollectors(client, testConfig)

      const metaBefore = getCollectorMeta("test_collector")
      expect(metaBefore.isRunning).toBe(true)

      // Trigger an update by calling appendRows from the sink
      const writer = makeNdjsonWriter.mock.results[0].value
      await writer.appendRows([])

      const metaAfter = getCollectorMeta("test_collector")
      expect(metaAfter.isRunning).toBe(true) // Should still be true
      expect(metaAfter.lastUpdatedAt).toBeDefined()
    })
  })

  describe("startMonitor", () => {
    beforeEach(() => {
      // Setup monitor stream mock with Subject
      const mockSubject = new Subject()
      makeMonitorStream.mockReturnValue(mockSubject)
    })

    it("should create monitor stream with correct config", async () => {
      const monitorConfig = createMockConfig({
        epics: [
          {
            name: "monitor",
            type: "monitor",
            monitoringDuration: 5000,
            monitoringInterval: 10000,
          },
        ],
      })

      const { startMonitor } = await import("./init-collectors.js")
      startMonitor(monitorConfig)

      expect(makeMonitorStream).toHaveBeenCalled()
      const monitorEpic = makeMonitorStream.mock.calls[0][1]
      expect(monitorEpic.name).toBe("monitor")
      expect(monitorEpic.monitoringDuration).toBe(5000)
    })

    it("should update metadata when monitor starts", async () => {
      const monitorConfig = createMockConfig({
        epics: [
          { name: "monitor", monitoringDuration: 5000 },
        ],
      })

      const { startMonitor, getCollectorMeta } = await import("./init-collectors.js")
      startMonitor(monitorConfig)

      const meta = getCollectorMeta("monitor")
      expect(meta.isRunning).toBe(true)
      expect(meta.startedAt).toBe(Date.now())
      expect(meta.willCompleteAt).toBe(Date.now() + 5000)
    })

    it("should update metadata on each monitor cycle", async () => {
      const mockSubject = new Subject()
      makeMonitorStream.mockReturnValue(mockSubject)

      const monitorConfig = createMockConfig({
        epics: [{ name: "monitor", monitoringDuration: 5000 }],
      })

      const { startMonitor, getCollectorMeta } = await import("./init-collectors.js")
      startMonitor(monitorConfig)

      // Emit a next event
      mockSubject.next([{ ts: Date.now(), cmd: "GET key" }])

      const meta = getCollectorMeta("monitor")
      expect(meta.lastUpdatedAt).toBe(Date.now())
    })

    it("should handle monitor errors", async () => {
      const mockSubject = new Subject()
      makeMonitorStream.mockReturnValue(mockSubject)

      const monitorConfig = createMockConfig({
        epics: [{ name: "monitor", monitoringDuration: 5000 }],
      })

      const { startMonitor, getCollectorMeta } = await import("./init-collectors.js")
      startMonitor(monitorConfig)

      // Emit an error
      mockSubject.error(new Error("Monitor error"))

      const meta = getCollectorMeta("monitor")
      expect(meta.isRunning).toBe(false)
      expect(meta.lastErrorAt).toBe(Date.now())
      expect(meta.lastError).toContain("Monitor error")
      expect(meta.willCompleteAt).toBeNull()
    })

    it("should update metadata on completion", async () => {
      const mockSubject = new Subject()
      makeMonitorStream.mockReturnValue(mockSubject)

      const monitorConfig = createMockConfig({
        epics: [{ name: "monitor", monitoringDuration: 5000 }],
      })

      const { startMonitor, getCollectorMeta } = await import("./init-collectors.js")
      startMonitor(monitorConfig)

      // Complete the stream
      mockSubject.complete()

      const meta = getCollectorMeta("monitor")
      expect(meta.isRunning).toBe(false)
      expect(meta.completedAt).toBe(Date.now())
    })

    it("should create stopper that unsubscribes and closes sink", async () => {
      const mockSubject = new Subject()

      // Create mock subscription with spy
      const mockSubscription = {
        unsubscribe: vi.fn(),
        closed: false,
      }

      // Intercept subscribe to return our mock
      vi.spyOn(mockSubject, "subscribe").mockReturnValue(mockSubscription)

      makeMonitorStream.mockReturnValue(mockSubject)

      const mockWriter = {
        appendRows: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
      }
      makeNdjsonWriter.mockReturnValue(mockWriter)

      const monitorConfig = createMockConfig({
        epics: [{ name: "monitor", monitoringDuration: 5000 }],
      })

      const { startMonitor, stopMonitor } = await import("./init-collectors.js")
      startMonitor(monitorConfig)

      await stopMonitor()

      expect(mockSubscription.unsubscribe).toHaveBeenCalled()
      expect(mockWriter.close).toHaveBeenCalled()
    })

    it("should write logs to ndjson writer", async () => {
      const mockWriter = {
        appendRows: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
      }
      makeNdjsonWriter.mockReturnValue(mockWriter)

      // Mock makeMonitorStream to call the onLogs callback
      makeMonitorStream.mockImplementation((onLogs) => {
        const subject = new Subject()
        // Simulate calling onLogs
        setTimeout(async () => {
          await onLogs([{ ts: Date.now(), cmd: "GET key" }])
          subject.next([{ ts: Date.now(), cmd: "GET key" }])
        }, 0)
        return subject
      })

      const monitorConfig = createMockConfig({
        epics: [{ name: "monitor", monitoringDuration: 5000 }],
      })

      const { startMonitor } = await import("./init-collectors.js")
      startMonitor(monitorConfig)

      // Wait for async operations
      await vi.runAllTimersAsync()

      expect(mockWriter.appendRows).toHaveBeenCalled()
    })
  })

  describe("stopMonitor", () => {
    it("should call the monitor stopper", async () => {
      const mockSubject = new Subject()
      makeMonitorStream.mockReturnValue(mockSubject)

      const mockWriter = {
        appendRows: vi.fn().mockResolvedValue(undefined),
        close: vi.fn(),
      }
      makeNdjsonWriter.mockReturnValue(mockWriter)

      const monitorConfig = createMockConfig({
        epics: [{ name: "monitor", monitoringDuration: 5000 }],
      })

      const { startMonitor, stopMonitor, getCollectorMeta } = await import("./init-collectors.js")
      startMonitor(monitorConfig)

      await stopMonitor()

      const meta = getCollectorMeta("monitor")
      expect(meta.isRunning).toBe(false)
      expect(meta.stoppedAt).toBe(Date.now())
      expect(meta.willCompleteAt).toBeNull()
      expect(mockWriter.close).toHaveBeenCalled()
    })
  })
})
