import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
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

  describe("validatePartialConfig", () => {
    it("should accept valid config with pollingInterval", async () => {
      const { updateConfig } = await import("./config.js")
      const result = updateConfig({ pollingInterval: 5000 })
      expect(result.success).toBe(true)
    })

    it("should accept valid config with monitoring object", async () => {
      const { updateConfig } = await import("./config.js")
      const result = updateConfig({
        monitoring: { monitorEnabled: true, monitorDuration: 1000 },
      })
      expect(result.success).toBe(true)
    })

    it("should reject null or non-object configs", async () => {
      const { updateConfig } = await import("./config.js")

      expect(updateConfig(null).success).toBe(false)
      expect(updateConfig(null).message).toContain("must be an object")

      expect(updateConfig("string").success).toBe(false)
      expect(updateConfig(123).success).toBe(false)
      expect(updateConfig([]).success).toBe(false)
    })

    it("should reject invalid pollingInterval values", async () => {
      const { updateConfig } = await import("./config.js")

      expect(updateConfig({ pollingInterval: 0 }).success).toBe(false)
      expect(updateConfig({ pollingInterval: 0 }).message).toContain(
        "pollingInterval must be a positive",
      )

      expect(updateConfig({ pollingInterval: -100 }).success).toBe(false)
      expect(updateConfig({ pollingInterval: NaN }).success).toBe(false)
      expect(updateConfig({ pollingInterval: "1000" }).success).toBe(false)
      expect(updateConfig({ pollingInterval: Infinity }).success).toBe(false)
    })

    it("should reject invalid monitoring object", async () => {
      const { updateConfig } = await import("./config.js")

      expect(updateConfig({ monitoring: "not an object" }).success).toBe(false)
      expect(updateConfig({ monitoring: "not an object" }).message).toContain(
        "monitoring must be an object",
      )

      expect(updateConfig({ monitoring: 123 }).success).toBe(false)
      expect(updateConfig({ monitoring: [] }).success).toBe(false)
    })

    it("should reject invalid monitoring fields", async () => {
      const { updateConfig } = await import("./config.js")

      // Invalid monitorEnabled (not boolean)
      expect(
        updateConfig({ monitoring: { monitorEnabled: "true" } }).success,
      ).toBe(false)
      expect(
        updateConfig({ monitoring: { monitorEnabled: 1 } }).message,
      ).toContain("monitorEnabled must be a boolean")

      // Invalid monitorDuration (0, negative, non-number)
      expect(
        updateConfig({ monitoring: { monitorDuration: 0 } }).success,
      ).toBe(false)
      expect(
        updateConfig({ monitoring: { monitorDuration: -100 } }).message,
      ).toContain("monitorDuration must be a positive")

      expect(
        updateConfig({ monitoring: { monitorDuration: NaN } }).success,
      ).toBe(false)
      expect(
        updateConfig({ monitoring: { monitorDuration: "1000" } }).success,
      ).toBe(false)
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
        VALKEY_URL: "valkey://envhost:6379",
        PORT: "5000",
        DATA_DIR: "/env/data",
        BATCH_MS: "2000",
        BATCH_MAX: "200",
      })

      const { getConfig } = await import("./config.js")
      const config = getConfig()

      expect(config.valkey.url).toBe("valkey://envhost:6379")
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
    it("should merge and persist valid partial config", async () => {
      const existingConfig = {
        valkey: { url: "valkey://localhost:6379" },
        server: { port: 3000, data_dir: "/app/data" },
      }

      YAML.parse.mockReturnValue(existingConfig)

      const { updateConfig } = await import("./config.js")
      const result = updateConfig({ server: { port: 4000 } })

      expect(result.success).toBe(true)
      expect(YAML.stringify).toHaveBeenCalled()
      expect(fs.writeFileSync).toHaveBeenCalled()
      expect(fs.renameSync).toHaveBeenCalled()
    })

    it("should return error response for invalid config", async () => {
      const { updateConfig } = await import("./config.js")
      const result = updateConfig({ pollingInterval: -1 })

      expect(result.success).toBe(false)
      expect(result.statusCode).toBe(400)
      expect(result.message).toBeTruthy()
      expect(fs.writeFileSync).not.toHaveBeenCalled()
    })

    it("should create temporary file before renaming (atomic write)", async () => {
      const { updateConfig } = await import("./config.js")
      updateConfig({ pollingInterval: 5000 })

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
      const initialConfig = { server: { port: 3000 } }
      const updatedConfig = { server: { port: 4000 } }

      YAML.parse.mockReturnValueOnce(initialConfig)
      YAML.parse.mockReturnValueOnce(initialConfig) // for getConfig call inside updateConfig
      YAML.parse.mockReturnValueOnce(updatedConfig) // for reload after write

      const { getConfig, updateConfig } = await import("./config.js")

      const before = getConfig()
      expect(before.server.port).toBe(3000)

      updateConfig({ server: { port: 4000 } })

      // getConfig should reflect the updated value (from reload)
      const after = getConfig()
      expect(after.server.port).toBe(4000)
    })
  })
})
