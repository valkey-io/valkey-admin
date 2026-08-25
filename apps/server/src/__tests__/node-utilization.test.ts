import { describe, it, beforeEach } from "node:test"
import assert from "node:assert"
import {
  calculateMemoryUtilization,
  readCpuSample,
  computeNodeUtilization,
  clearCpuSamples,
  type InfoSections
} from "../node-utilization"

const GIB = 1024 * 1024 * 1024

const mainThreadCpu = (sys: number, user: number) => ({
  used_cpu_sys_main_thread: String(sys),
  used_cpu_user_main_thread: String(user),
})

const sections = (memory: Record<string, string>, cpu: Record<string, string> = {}): InfoSections => ({
  Memory: memory,
  CPU: cpu,
})

beforeEach(() => clearCpuSamples())

describe("memory basis", () => {
  it("measures against maxmemory when one is configured", () => {
    const result = calculateMemoryUtilization({
      used_memory: String(GIB),
      maxmemory: String(2 * GIB),
      total_system_memory: String(16 * GIB),
    })

    assert.strictEqual(result.memory_utilization_percent, 50)
    assert.strictEqual(result.memory_basis, "maxmemory")
    assert.strictEqual(result.memory_limit_bytes, 2 * GIB)
  })

  it("falls back to host RAM when maxmemory is 0", () => {
    const result = calculateMemoryUtilization({
      used_memory: String(4 * GIB),
      maxmemory: "0",
      total_system_memory: String(16 * GIB),
    })

    assert.strictEqual(result.memory_utilization_percent, 25)
    assert.strictEqual(result.memory_basis, "total_system_memory")
  })

  it("produces no percent when the node reports neither limit", () => {
    const result = calculateMemoryUtilization({ used_memory: String(GIB), maxmemory: "0" })

    assert.strictEqual(result.memory_utilization_percent, null)
    assert.strictEqual(result.memory_basis, "none")
    assert.strictEqual(result.memory_limit_bytes, null)
  })
})

describe("cpu derivation", () => {
  it("prefers the main thread counters, which are bounded by one core", () => {
    const sample = readCpuSample({
      ...mainThreadCpu(1, 2),
      used_cpu_sys: "100",
      used_cpu_user: "200",
    }, 1000)

    assert.deepStrictEqual(sample, { ts: 1000, totalCpuSeconds: 3 })
  })

  it("reports cpu time as a share of one core, and nothing on the first poll", () => {
    const memory = { used_memory: String(GIB), maxmemory: String(2 * GIB) }

    const first = computeNodeUtilization("node-1", sections(memory, mainThreadCpu(1, 1)), 0)
    assert.strictEqual(first.cpu_utilization_percent, null)

    const second = computeNodeUtilization("node-1", sections(memory, mainThreadCpu(1.5, 1.5)), 2000)
    assert.strictEqual(second.cpu_utilization_percent, 50)
    assert.strictEqual(second.cpu_sample_interval_seconds, 2)
  })

  it("keeps the older baseline when a poll arrives too soon to diff", () => {
    const memory = { used_memory: String(GIB), maxmemory: String(2 * GIB) }
    computeNodeUtilization("node-1", sections(memory, mainThreadCpu(1, 1)), 0)

    const tooSoon = computeNodeUtilization("node-1", sections(memory, mainThreadCpu(1, 1.4)), 500)
    assert.strictEqual(tooSoon.cpu_utilization_percent, null)

    // Diffed against t=0, not the rejected t=500: 1 cpu second over 2 seconds.
    const later = computeNodeUtilization("node-1", sections(memory, mainThreadCpu(1.5, 1.5)), 2000)
    assert.strictEqual(later.cpu_utilization_percent, 50)
  })

  it("produces no reading when the counters go backwards after a restart", () => {
    const memory = { used_memory: String(GIB), maxmemory: String(2 * GIB) }
    computeNodeUtilization("node-1", sections(memory, mainThreadCpu(50, 50)), 0)

    const afterRestart = computeNodeUtilization("node-1", sections(memory, mainThreadCpu(0, 1)), 2000)

    assert.strictEqual(afterRestart.cpu_utilization_percent, null)
    assert.ok(afterRestart.warnings.some((w) => w.includes("went backwards")))
  })
})
