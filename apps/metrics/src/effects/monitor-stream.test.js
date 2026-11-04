import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mockEnv, createMockMonitor } from "../__tests__/test-helpers.js"

let mockMonitorGlobal = null
let mockValkeyInstances = []

// Mock iovalkey with a class. connectMonitor builds the monitor connection
// directly (`monitor: true`), so each instance is the monitor handle itself and
// shares its spies with the current mock monitor.
class MockValkey {
  constructor(options) {
    this.options = options
    mockValkeyInstances.push(this)
    const monitor = mockMonitorGlobal || createMockMonitor()
    this.on = monitor.on
    this.off = monitor.off
    this.disconnect = monitor.disconnect
    this.status = "wait"
  }
  once(event, listener) {
    if (event === "monitoring") this.onMonitoring = listener
    return this
  }
  async connect() {
    this.status = "monitoring"
    this.onMonitoring?.()
  }
}

vi.mock("iovalkey", () => {
  return {
    default: MockValkey,
  }
})

describe("monitor-stream", () => {
  let cleanupEnv
  let mockMonitor

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockValkeyInstances = []

    // Setup mock monitor
    mockMonitor = createMockMonitor()
    mockMonitorGlobal = mockMonitor
  })

  afterEach(() => {
    vi.useRealTimers()
    if (cleanupEnv) {
      cleanupEnv()
      cleanupEnv = null
    }
  })

  describe("makeMonitorStream", () => {
    it("should use environment variables to connect to iovalkey client", async () => {
      cleanupEnv = mockEnv({
        VALKEY_HOST: "envhost",
        VALKEY_PORT: "6379",
        VALKEY_USERNAME: "envuser",
        VALKEY_PASSWORD: "envpass",
      })

      const { makeMonitorStream } = await import("./monitor-stream.js")

      const config = {
        valkey: {},
        monitoringInterval: 5000,
        monitoringDuration: 1000,
        maxCommandsPerRun: 100,
      }

      const stream$ = makeMonitorStream(async () => {}, config)
      const subscription = stream$.subscribe()

      await vi.advanceTimersByTimeAsync(0)

      const instance = mockValkeyInstances[0]
      expect(instance.options.host).toBe("envhost")
      expect(instance.options.port).toBe(6379)
      expect(instance.options.username).toBe("envuser")
      expect(instance.options.password).toBe("envpass")
      expect(instance.options.monitor).toBe(true)
      expect(instance.options.lazyConnect).toBe(true)

      subscription.unsubscribe()
    })

    it("should start monitor and collect logs", async () => {
      const { makeMonitorStream } = await import("./monitor-stream.js")

      const collectedLogs = []
      const onLogs = vi.fn(async (logs) => {
        collectedLogs.push(...logs)
      })

      const config = {
        valkey: { url: "valkey://localhost:6379" },
        monitoringInterval: 10000,
        monitoringDuration: 1000,
        maxCommandsPerRun: 100,
      }

      const stream$ = makeMonitorStream(onLogs, config)

      // Subscribe to the stream
      const results = []
      const subscription = stream$.subscribe((logs) => {
        results.push(logs)
      })

      // Wait for initial timer (t=0)
      await vi.advanceTimersByTimeAsync(0)

      // Emit some monitor events
      const monitorHandler = mockMonitor.on.mock.calls.find(
        ([event]) => event === "monitor",
      )?.[1]

      monitorHandler(Date.now(), ["GET", "key1"])
      monitorHandler(Date.now(), ["SET", "key2", "value"])

      // Advance past the monitoring duration
      await vi.advanceTimersByTimeAsync(1000)

      expect(results.length).toBeGreaterThan(0)
      expect(results[0]).toHaveLength(2)
      expect(results[0][0].command).toBe("GET key1")
      expect(results[0][1].command).toBe("SET key2 value")

      subscription.unsubscribe()
    })

    it("should complete on duration timeout", async () => {
      const { makeMonitorStream } = await import("./monitor-stream.js")

      const config = {
        valkey: { url: "valkey://localhost:6379" },
        monitoringInterval: 10000,
        monitoringDuration: 500,
        maxCommandsPerRun: 100,
      }

      const stream$ = makeMonitorStream(async () => { }, config)

      const subscription = stream$.subscribe()

      // Advance to trigger first cycle
      await vi.advanceTimersByTimeAsync(0)

      // Advance past duration (should complete the race)
      await vi.advanceTimersByTimeAsync(500)

      // Verify cleanup was called
      expect(mockMonitor.off).toHaveBeenCalled()
      expect(mockMonitor.disconnect).toHaveBeenCalled()

      subscription.unsubscribe()
    })

    it("should clean up resources in finally block", async () => {
      const { makeMonitorStream } = await import("./monitor-stream.js")

      const config = {
        valkey: { url: "valkey://localhost:6379" },
        monitoringInterval: 10000,
        monitoringDuration: 100,
        maxCommandsPerRun: 100,
      }

      const stream$ = makeMonitorStream(async () => { }, config)
      const subscription = stream$.subscribe()

      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(100)

      // Verify cleanup
      expect(mockMonitor.off).toHaveBeenCalledWith(
        "monitor",
        expect.any(Function),
      )
      expect(mockMonitor.disconnect).toHaveBeenCalled()

      subscription.unsubscribe()
    })

    it("should call onLogs callback with collected rows", async () => {
      const { makeMonitorStream } = await import("./monitor-stream.js")

      const onLogs = vi.fn(async () => { })

      const config = {
        valkey: { url: "valkey://localhost:6379" },
        monitoringInterval: 10000,
        monitoringDuration: 100,
        maxCommandsPerRun: 100,
      }

      const stream$ = makeMonitorStream(onLogs, config)
      const subscription = stream$.subscribe()

      await vi.advanceTimersByTimeAsync(0)

      // Emit events
      const monitorHandler = mockMonitor.on.mock.calls.find(
        ([event]) => event === "monitor",
      )?.[1]
      monitorHandler(Date.now(), ["GET", "key"])

      await vi.advanceTimersByTimeAsync(100)

      expect(onLogs).toHaveBeenCalled()
      expect(onLogs.mock.calls[0][0]).toHaveLength(1)

      subscription.unsubscribe()
    })
  })

  describe("periodic execution", () => {
    it("should run monitor at intervals", async () => {
      const { makeMonitorStream } = await import("./monitor-stream.js")

      const config = {
        valkey: { url: "valkey://localhost:6379" },
        monitoringInterval: 1000,
        monitoringDuration: 100,
        maxCommandsPerRun: 100,
      }

      const results = []
      const stream$ = makeMonitorStream(async () => { }, config)
      const subscription = stream$.subscribe((logs) => results.push(logs))

      // First cycle at t=0
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(100)

      // Second cycle at t=1000
      await vi.advanceTimersByTimeAsync(900)
      await vi.advanceTimersByTimeAsync(100)

      // Should have run twice
      expect(results.length).toBeGreaterThanOrEqual(2)

      subscription.unsubscribe()
    })
  })
})
