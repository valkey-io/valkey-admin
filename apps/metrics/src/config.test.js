import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { EPIC_FIELD_BOUNDS } from "../../../common/src/constants.js"
import { mockEnv } from "./__tests__/test-helpers.js"

// Mock node:fs and yaml modules
vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
  },
}))

vi.mock("yaml", () => ({
  default: {
    parse: vi.fn(),
    stringify: vi.fn(),
  },
}))

describe("config", () => {
  let fs
  let YAML
  let cleanupEnv

  beforeEach(async () => {
    // Reset modules to ensure clean state
    vi.resetModules()

    // Get mocked modules
    fs = (await import("node:fs")).default
    YAML = (await import("yaml")).default

    // Setup default mocks
    fs.readFileSync.mockReturnValue("")
    YAML.parse.mockReturnValue({})
    YAML.stringify.mockReturnValue("")
  })

  afterEach(() => {
    vi.clearAllMocks()
    if (cleanupEnv) {
      cleanupEnv()
      cleanupEnv = null
    }
  })

  describe("request validation", () => {
    it("should accept a patch for a wired epic", async () => {
      YAML.parse.mockReturnValue({
        epics: [{ name: "monitor", monitoringDuration: 10000 }],
      })
      const { updateConfig } = await import("./config.js")
      const result = updateConfig({
        epics: { monitor: { monitoringDuration: 15000 } },
      })
      expect(result.success).toBe(true)
    })

    it("should reject null or non-object payloads", async () => {
      const { updateConfig } = await import("./config.js")

      expect(updateConfig(null).success).toBe(false)
      expect(updateConfig("string").success).toBe(false)
      expect(updateConfig(123).success).toBe(false)
      expect(updateConfig([]).success).toBe(false)
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should reject every top-level key other than epics", async () => {
      YAML.parse.mockReturnValue({ epics: [{ name: "monitor" }] })
      const { updateConfig } = await import("./config.js")

      // data_dir is a second, traversal-free way to redirect where NDJSON is
      // written, so it must not be settable through the API.
      const dataDir = updateConfig({ server: { data_dir: "/etc" } })
      expect(dataDir.success).toBe(false)
      expect(dataDir.statusCode).toBe(400)
      expect(dataDir.message).toContain("server")

      expect(updateConfig({ collector: { batch_ms: 1 } }).success).toBe(false)
      expect(updateConfig({ backend: { ping_interval: 1 } }).success).toBe(false)
      expect(updateConfig({ valkey: { mode: "cluster" } }).success).toBe(false)
      expect(updateConfig({
        epics: { monitor: { monitoringDuration: 5000 } },
        server: { data_dir: "/etc" },
      }).success).toBe(false)

      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should reject a wholesale epics array", async () => {
      YAML.parse.mockReturnValue({ epics: [{ name: "monitor" }] })
      const { updateConfig } = await import("./config.js")

      // An array would replace cfg.epics outright, letting a caller invent
      // epics (and their filename prefixes) instead of tuning existing ones.
      const result = updateConfig({ epics: [{ name: "evil", poll_ms: 5000 }] })
      expect(result.success).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should reject an empty epics map or an empty patch", async () => {
      YAML.parse.mockReturnValue({ epics: [{ name: "monitor" }] })
      const { updateConfig } = await import("./config.js")

      expect(updateConfig({}).success).toBe(false)
      expect(updateConfig({ epics: {} }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: {} } }).success).toBe(false)
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should reject prototype-polluting epic keys", async () => {
      YAML.parse.mockReturnValue({ epics: [{ name: "monitor" }] })
      const { updateConfig } = await import("./config.js")

      const payload = JSON.parse("{\"epics\":{\"__proto__\":{\"poll_ms\":5000}}}")
      const result = updateConfig(payload)
      expect(result.success).toBe(false)
      expect(result.message).toContain("__proto__")
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should reject epic names outside the safe token pattern", async () => {
      YAML.parse.mockReturnValue({ epics: [{ name: "monitor" }] })
      const { updateConfig } = await import("./config.js")

      expect(updateConfig({ epics: { "../../etc/cron.d": { poll_ms: 5000 } } }).success).toBe(false)
      expect(updateConfig({ epics: { "Monitor": { poll_ms: 5000 } } }).success).toBe(false)
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should reject unknown fields inside an epic patch", async () => {
      YAML.parse.mockReturnValue({ epics: [{ name: "monitor", file_prefix: "monitor" }] })
      const { updateConfig } = await import("./config.js")

      // file_prefix reaches path.join() in the NDJSON writer, so it must never
      // be settable from a request.
      const traversal = updateConfig({ epics: { monitor: { file_prefix: "../../../tmp/pwn" } } })
      expect(traversal.success).toBe(false)
      expect(traversal.statusCode).toBe(400)
      expect(traversal.message).toContain("file_prefix")

      expect(updateConfig({ epics: { monitor: { name: "other" } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { type: "monitor" } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { nonsense: 1 } } }).success).toBe(false)
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should reject out-of-range and non-integer field values", async () => {
      YAML.parse.mockReturnValue({ epics: [{ name: "monitor" }, { name: "cpu" }] })
      const { updateConfig } = await import("./config.js")

      expect(updateConfig({ epics: { monitor: { monitoringDuration: 0 } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { monitoringDuration: -100 } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { monitoringDuration: NaN } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { monitoringDuration: "1000" } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { monitoringDuration: 1.5 } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { monitoringDuration: 3_600_001 } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { monitoringInterval: 0 } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { maxCommandsPerRun: -1 } } }).success).toBe(false)
      expect(updateConfig({ epics: { monitor: { cutoffFrequency: 0 } } }).success).toBe(false)
      expect(updateConfig({ epics: { cpu: { poll_ms: 999 } } }).success).toBe(false)
      // Retention below 1 MB would make computeCapacity disable rotation.
      expect(updateConfig({ epics: { cpu: { data_retention_mb: 0 } } }).success).toBe(false)
      expect(updateConfig({ epics: { cpu: { data_retention_mb: "x" } } }).success).toBe(false)
      expect(updateConfig({ epics: { cpu: { data_retention_days: 0 } } }).success).toBe(false)
      expect(updateConfig({ epics: { cpu: { data_retention_days: 366 } } }).success).toBe(false)

      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should accept values at the bounds the UI can produce", async () => {
      YAML.parse.mockReturnValue({ epics: [{ name: "monitor" }] })
      const { updateConfig } = await import("./config.js")

      expect(updateConfig({
        epics: {
          monitor: {
            monitoringDuration: EPIC_FIELD_BOUNDS.monitoringDuration.min,
            monitoringInterval: EPIC_FIELD_BOUNDS.monitoringInterval.max,
            maxCommandsPerRun: EPIC_FIELD_BOUNDS.maxCommandsPerRun.max,
            cutoffFrequency: EPIC_FIELD_BOUNDS.cutoffFrequency.min,
          },
        },
      }).success).toBe(true)
    })

    it("should reject unknown epic names", async () => {
      YAML.parse.mockReturnValue({
        epics: [{ name: "monitor" }],
      })
      const { updateConfig } = await import("./config.js")
      const result = updateConfig({ epics: { nonexistent: { monitoringDuration: 5000 } } })
      expect(result.success).toBe(false)
      expect(result.message).toContain("Unknown epic")
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })
  })

  describe("loadConfig", () => {
    it("should load and parse YAML from config file", async () => {
      const mockConfig = {
        valkey: { url: "valkey://localhost:6380" },
      }

      fs.readFileSync.mockReturnValue("valkey:\n  url: valkey://localhost:6380")
      YAML.parse.mockReturnValue(mockConfig)

      const { getConfig } = await import("./config.js")
      const config = getConfig()

      expect(fs.readFileSync).toHaveBeenCalled()
      expect(YAML.parse).toHaveBeenCalled()
      expect(config.valkey.url).toBe("valkey://localhost:6380")
    })

    it("should refuse to load an epic whose name is not a safe token", async () => {
      // The name becomes a filename prefix under data_dir, so an unsafe one is
      // a hard configuration error rather than something to work around.
      YAML.parse.mockReturnValue({ epics: [{ name: "../../etc/cron.d" }] })

      const { getConfig } = await import("./config.js")
      expect(() => getConfig()).toThrow(/Invalid epic name/)
    })

    it("should drop epics whose name is not a known kind", async () => {
      YAML.parse.mockReturnValue({
        epics: [{ name: "monitor" }, { name: "not_a_collector" }],
      })
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

      const { getConfig } = await import("./config.js")
      const config = getConfig()

      expect(config.epics.map((e) => e.name)).toEqual(["monitor"])
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("not_a_collector"))
      consoleError.mockRestore()
    })

    it("should apply default values when parsed config is empty", async () => {
      YAML.parse.mockReturnValue({})

      const { getConfig } = await import("./config.js")
      const config = getConfig()

      expect(config.server.port).toBe(3000)
      expect(config.server.data_dir).toBe("/app/data")
      expect(config.collector.batch_ms).toBe(60000)
      expect(config.collector.batch_max).toBe(500)
      expect(Array.isArray(config.epics)).toBe(true)
    })

    it("should override config with environment variables", async () => {
      cleanupEnv = mockEnv({
        PORT: "5000",
        DATA_DIR: "/env/data",
        BATCH_MS: "2000",
        BATCH_MAX: "200",
      })

      const { getConfig } = await import("./config.js")
      const config = getConfig()

      expect(config.server.port).toBe(5000)
      expect(config.server.data_dir).toBe("/env/data")
      expect(config.collector.batch_ms).toBe(2000)
      expect(config.collector.batch_max).toBe(200)
    })

    it("should handle CONFIG_PATH environment variable", async () => {
      cleanupEnv = mockEnv({
        CONFIG_PATH: "/custom/path/config.yml",
      })

      fs.readFileSync.mockReturnValue("{}")

      const { getConfig } = await import("./config.js")
      getConfig()

      expect(fs.readFileSync).toHaveBeenCalledWith(
        "/custom/path/config.yml",
        "utf8",
      )
    })

    it("should set logging environment variables from config", async () => {
      const mockConfig = {
        logging: { level: "debug", format: "json" },
      }

      YAML.parse.mockReturnValue(mockConfig)

      const { getConfig } = await import("./config.js")
      getConfig()

      expect(process.env.LOG_LEVEL).toBe("debug")
      expect(process.env.LOG_FORMAT).toBe("json")
    })

    it("should handle debug_metrics flag", async () => {
      const mockConfig = { debug_metrics: true }
      YAML.parse.mockReturnValue(mockConfig)

      const { getConfig } = await import("./config.js")
      getConfig()

      expect(process.env.DEBUG_METRICS).toBe("1")

      // Test false case
      vi.resetModules()
      delete process.env.DEBUG_METRICS

      YAML.parse.mockReturnValue({ debug_metrics: false })
      const { getConfig: getConfig2 } = await import("./config.js")
      getConfig2()

      expect(process.env.DEBUG_METRICS).toBe("0")
    })
  })

  describe("updateConfig", () => {
    it("should apply and persist a valid patch", async () => {
      YAML.parse.mockReturnValue({
        epics: [{ name: "monitor", monitoringDuration: 10000, cutoffFrequency: 100 }],
      })

      const { updateConfig } = await import("./config.js")
      const result = updateConfig({ epics: { monitor: { monitoringDuration: 20000 } } })

      expect(result.success).toBe(true)
      expect(YAML.stringify).toHaveBeenCalled()
      expect(fs.writeFileSync).toHaveBeenCalled()
      expect(fs.renameSync).toHaveBeenCalled()

      // Only the patched field changes; identity and untouched fields survive.
      const written = YAML.stringify.mock.calls[0][0]
      expect(written.epics[0]).toEqual({
        name: "monitor",
        monitoringDuration: 20000,
        cutoffFrequency: 100,
        data_retention_mb: 10,
        data_retention_days: 30,
      })
    })

    it("should apply multiple epics in a single write", async () => {
      YAML.parse.mockReturnValue({
        epics: [
          { name: "monitor", monitoringDuration: 10000 },
          { name: "cpu", poll_ms: 5000 },
        ],
      })

      const { updateConfig } = await import("./config.js")
      const result = updateConfig({
        epics: {
          monitor: { monitoringDuration: 20000 },
          cpu: { poll_ms: 10000, data_retention_days: 7 },
        },
      })

      expect(result.success).toBe(true)
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1)

      const written = YAML.stringify.mock.calls[0][0]
      expect(written.epics[0].monitoringDuration).toBe(20000)
      expect(written.epics[1].poll_ms).toBe(10000)
      expect(written.epics[1].data_retention_days).toBe(7)
    })

    it("should write nothing when any epic in the payload is invalid", async () => {
      YAML.parse.mockReturnValue({
        epics: [
          { name: "monitor", monitoringDuration: 10000 },
          { name: "cpu", poll_ms: 5000 },
        ],
      })

      const { updateConfig } = await import("./config.js")
      const result = updateConfig({
        epics: {
          monitor: { monitoringDuration: 20000 },
          cpu: { poll_ms: 1 },
        },
      })

      expect(result.success).toBe(false)
      expect(fs.writeFileSync).not.toHaveBeenCalled()
      expect(fs.renameSync).not.toHaveBeenCalled()
    })

    it("should write nothing when any epic in the payload is unknown", async () => {
      YAML.parse.mockReturnValue({
        epics: [{ name: "monitor", monitoringDuration: 10000 }],
      })

      const { updateConfig } = await import("./config.js")
      const result = updateConfig({
        epics: {
          monitor: { monitoringDuration: 20000 },
          ghost: { poll_ms: 5000 },
        },
      })

      expect(result.success).toBe(false)
      expect(result.message).toContain("ghost")
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should return error response for invalid config", async () => {
      const { updateConfig } = await import("./config.js")
      const result = updateConfig({ epics: "not an object" })

      expect(result.success).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.message).toBeTruthy()
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should create temporary file before renaming (atomic write)", async () => {
      YAML.parse.mockReturnValue({ epics: [{ name: "monitor" }] })
      const { updateConfig } = await import("./config.js")
      updateConfig({ epics: { monitor: { monitoringDuration: 5000 } } })

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining(".tmp"),
        expect.any(String),
        "utf8",
      )

      const tmpPath = fs.writeFileSync.mock.calls[0][0]
      const finalPath = fs.renameSync.mock.calls[0][1]

      expect(tmpPath).toContain(".tmp")
      expect(finalPath).not.toContain(".tmp")
      expect(fs.renameSync).toHaveBeenCalledWith(tmpPath, finalPath)
    })

    it("should reload config after update", async () => {
      const initialConfig = { epics: [{ name: "monitor", monitoringDuration: 10000 }] }
      const updatedConfig = { epics: [{ name: "monitor", monitoringDuration: 20000 }] }

      YAML.parse.mockReturnValueOnce(initialConfig)
      YAML.parse.mockReturnValueOnce(initialConfig) // for getConfig call inside updateConfig
      YAML.parse.mockReturnValueOnce(updatedConfig) // for reload after write

      const { getConfig, updateConfig } = await import("./config.js")

      const before = getConfig()
      expect(before.epics[0].monitoringDuration).toBe(10000)

      updateConfig({ epics: { monitor: { monitoringDuration: 20000 } } })

      // getConfig should reflect the updated value (from reload)
      const after = getConfig()
      expect(after.epics[0].monitoringDuration).toBe(20000)
    })
  })
})
