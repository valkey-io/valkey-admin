import { vi } from "vitest"

/**
 * Creates a mock Valkey client with commonly used methods
 */
export const createMockValkeyClient = (overrides = {}) => ({
  sendCommand: vi.fn().mockResolvedValue([]),
  info: vi.fn().mockResolvedValue(""),
  disconnect: vi.fn(),
  monitor: vi.fn().mockResolvedValue(createMockMonitor()),
  ...overrides,
})

/**
 * Creates a mock monitor instance
 */
export const createMockMonitor = () => ({
  on: vi.fn(),
  off: vi.fn(),
  disconnect: vi.fn(),
})

/**
 * Creates a mock configuration object with defaults + overrides
 */
export const createMockConfig = (overrides = {}) => ({
  valkey: { url: "valkey://localhost:6379" },
  server: { port: 3000, data_dir: "/test/data" },
  collector: { batch_ms: 1000, batch_max: 100 },
  epics: [],
  ...overrides,
})

/**
 * Helper to set environment variables with automatic cleanup
 * Returns a cleanup function that restores original values
 */
export const mockEnv = (vars = {}) => {
  const original = {}
  Object.entries(vars).forEach(([key, value]) => {
    original[key] = process.env[key]
    process.env[key] = value
  })

  // Return cleanup function
  return () => {
    Object.entries(original).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    })
  }
}

/**
 * Creates an async iterator for mocking readline.createInterface
 */
export const createAsyncIterator = (items) => ({
  [Symbol.asyncIterator]: async function* () {
    for (const item of items) {
      yield item
    }
  },
  close: vi.fn(),
})

/**
 * Helper to create NDJSON formatted lines
 */
export const createNdjsonLines = (count, metricName = "test") => {
  return Array.from({ length: count }, (_, i) =>
    JSON.stringify({ ts: 1000 + i, metric: metricName, value: i }),
  )
}

/**
 * Helper to create mock file stream
 */
export const createMockFileStream = () => ({
  destroy: vi.fn(),
  on: vi.fn(),
  emit: vi.fn(),
})
