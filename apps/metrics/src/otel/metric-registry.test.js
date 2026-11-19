import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it, expect } from "vitest"
import {
  CPU_METRICS,
  KEYSPACE_METRICS,
  MEMORY_METRICS,
  cpuObservations,
  keyspaceObservations,
  memoryObservations
} from "./metric-registry.js"
import { parseInfo } from "../utils/helpers.js"

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__")
const readFixture = (name) => fs.readFileSync(path.join(fixturesDir, name), "utf8")

const memoryInfo = parseInfo(readFixture("info-memory.valkey-9.1-linux.txt"))
const cpuLinux = parseInfo(readFixture("info-cpu.valkey-9.1-linux.txt"))
const cpuMacos = parseInfo(readFixture("info-cpu.valkey-9.1-macos.txt"))

// The design tables "Memory" and "Memory breakdown", row by row.
const DESIGN_MEMORY = [
  ["valkey.memory.used", "updowncounter", "By", "used_memory"],
  ["valkey.memory.used.overhead", "updowncounter", "By", "used_memory_overhead"],
  ["valkey.memory.used.dataset", "updowncounter", "By", "used_memory_dataset"],
  ["valkey.memory.used.peak", "gauge", "By", "used_memory_peak"],
  ["valkey.memory.used.rss", "updowncounter", "By", "used_memory_rss"],
  ["valkey.memory.used.startup", "updowncounter", "By", "used_memory_startup"],
  ["valkey.memory.max", "updowncounter", "By", "maxmemory"],
  ["valkey.memory.fragmentation_ratio", "gauge", "1", "mem_fragmentation_ratio"],
  ["valkey.memory.fragmentation_bytes", "updowncounter", "By", "mem_fragmentation_bytes"],
  ["valkey.memory.allocator_allocated", "updowncounter", "By", "allocator_allocated"],
  ["valkey.memory.allocator_active", "updowncounter", "By", "allocator_active"],
  ["valkey.memory.allocator_resident", "updowncounter", "By", "allocator_resident"],
  ["valkey.memory.allocator_frag_bytes", "updowncounter", "By", "allocator_frag_bytes"],
  ["valkey.memory.not_counted_for_evict", "updowncounter", "By", "mem_not_counted_for_evict"],
  ["valkey.memory.clients_normal", "updowncounter", "By", "mem_clients_normal"],
  ["valkey.memory.replication_backlog", "updowncounter", "By", "mem_replication_backlog"],
  ["valkey.memory.total_replication_buffers", "updowncounter", "By", "mem_total_replication_buffers"],
  ["valkey.memory.used.vm_eval", "updowncounter", "By", "used_memory_vm_eval"],
  ["valkey.memory.used.vm_functions", "updowncounter", "By", "used_memory_vm_functions"],
  ["valkey.memory.lazyfree_pending_objects", "updowncounter", "{object}", "lazyfree_pending_objects"],
]

// The design table "CPU".
const DESIGN_CPU = [
  ["valkey.cpu.time", "used_cpu_user", "used_cpu_sys"],
  ["valkey.cpu.main_thread.time", "used_cpu_user_main_thread", "used_cpu_sys_main_thread"],
  ["valkey.cpu.children.time", "used_cpu_user_children", "used_cpu_sys_children"],
]

// Fields from "What is deliberately excluded" that are present in a real reply.
const EXCLUDED_FIELDS = [
  "allocator_rss_ratio", "allocator_rss_bytes", "used_memory_dataset_perc", "used_memory_peak_perc",
  "allocator_frag_ratio", "rss_overhead_ratio", "rss_overhead_bytes", "used_memory_vm_total",
  "mem_clients_slaves", "maxmemory_policy", "mem_allocator", "used_memory_lua", "allocator_muzzy",
  "mem_overhead_db_hashtable_rehashing", "mem_cluster_slot_import", "mem_cluster_slot_export",
  "mem_replicas_repl_buffer", "mem_aof_buffer", "mem_cluster_links", "active_defrag_running",
  "used_memory_scripts", "total_system_memory", "used_active_time_main_thread",
]

const byName = (observations) => Object.fromEntries(observations.map((o) => [o.name, o]))

describe("metric-registry", () => {
  describe("MEMORY_METRICS", () => {
    it("matches the design tables exactly", () => {
      const actual = MEMORY_METRICS.map(({ name, instrument, unit, field }) => [name, instrument, unit, field])
      expect(actual).toEqual(DESIGN_MEMORY)
    })
  })

  describe("CPU_METRICS", () => {
    it("has one counter per getrusage scope, in seconds", () => {
      expect(CPU_METRICS.map(({ name, user, system }) => [name, user, system])).toEqual(DESIGN_CPU)
      CPU_METRICS.forEach((metric) => {
        expect(metric.instrument).toBe("counter")
        expect(metric.unit).toBe("s")
      })
    })
  })

  describe("KEYSPACE_METRICS", () => {
    it("has keys and expires as key-count UpDownCounters", () => {
      expect(KEYSPACE_METRICS.map(({ name, instrument, unit, field }) => [name, instrument, unit, field])).toEqual([
        ["valkey.db.keys", "updowncounter", "{key}", "keys"],
        ["valkey.db.expires", "updowncounter", "{key}", "expires"],
      ])
    })
  })

  describe("memoryObservations", () => {
    it("observes every design field from a real Valkey 9.1 reply", () => {
      const observed = byName(memoryObservations(memoryInfo))
      expect(Object.keys(observed).sort()).toEqual(DESIGN_MEMORY.map(([name]) => name).sort())
      DESIGN_MEMORY.forEach(([name, , , field]) => {
        expect(observed[name].value).toBe(Number(memoryInfo[field]))
        expect(observed[name].attributes).toEqual({})
      })
    })

    it("leaves out valkey.memory.max when maxmemory is 0", () => {
      const observed = byName(memoryObservations({ ...memoryInfo, maxmemory: "0" }))
      expect(observed["valkey.memory.max"]).toBeUndefined()
      expect(Object.keys(observed)).toHaveLength(DESIGN_MEMORY.length - 1)
    })

    it("does not export the excluded fields", () => {
      const names = memoryObservations(memoryInfo).map((o) => o.name)
      const fieldsUsed = new Set(MEMORY_METRICS.map((m) => m.field))
      EXCLUDED_FIELDS.forEach((field) => expect(fieldsUsed.has(field)).toBe(false))
      expect(names.some((name) => /lua|perc|muzzy|slot_import|slot_export|active_time/.test(name))).toBe(false)
    })

    it("skips absent and non-numeric fields", () => {
      const sparse = memoryObservations({ maxmemory_policy: "noeviction", used_memory: "abc", used_memory_rss: "" })
      expect(sparse).toEqual([])
    })

    it("returns nothing for an empty or missing map", () => {
      expect(memoryObservations({})).toEqual([])
      expect(memoryObservations(undefined)).toEqual([])
    })
  })

  describe("cpuObservations", () => {
    it("observes three counters with cpu.mode user and system on Linux", () => {
      const observations = cpuObservations(cpuLinux)
      expect(observations).toHaveLength(6)
      DESIGN_CPU.forEach(([name, user, system]) => {
        expect(observations).toContainEqual({ name, value: Number(cpuLinux[user]), attributes: { "cpu.mode": "user" } })
        expect(observations).toContainEqual({ name, value: Number(cpuLinux[system]), attributes: { "cpu.mode": "system" } })
      })
    })

    it("leaves out the main-thread pair when the reply has no such fields (macOS)", () => {
      const names = new Set(cpuObservations(cpuMacos).map((o) => o.name))
      expect(names).toEqual(new Set(["valkey.cpu.time", "valkey.cpu.children.time"]))
    })

    it("does not export used_active_time_* fields", () => {
      const observations = cpuObservations({ ...cpuLinux, used_active_time_io_thread_1: "1.5" })
      expect(observations.every((o) => o.name.startsWith("valkey.cpu."))).toBe(true)
      expect(observations).toHaveLength(6)
    })

    it("skips one side of a pair when that side is not a finite number", () => {
      const observations = cpuObservations({ used_cpu_user: "1.5", used_cpu_sys: "nan" })
      expect(observations).toEqual([{ name: "valkey.cpu.time", value: 1.5, attributes: { "cpu.mode": "user" } }])
    })

    it("only uses cpu.mode as an attribute", () => {
      cpuObservations(cpuLinux).forEach((o) => expect(Object.keys(o.attributes)).toEqual(["cpu.mode"]))
    })
  })

  describe("keyspaceObservations", () => {
    it("reports keys and expires with valkey.db.index as a decimal string", () => {
      const { observations } = keyspaceObservations({ 0: { keys: 2, expires: 1 }, 3: { keys: 1, expires: 0 } }, new Set())
      expect(observations).toEqual([
        { name: "valkey.db.keys", value: 2, attributes: { "valkey.db.index": "0" } },
        { name: "valkey.db.expires", value: 1, attributes: { "valkey.db.index": "0" } },
        { name: "valkey.db.keys", value: 1, attributes: { "valkey.db.index": "3" } },
        { name: "valkey.db.expires", value: 0, attributes: { "valkey.db.index": "3" } },
      ])
    })

    it("reports 0 for a database that was seen before and is gone", () => {
      const first = keyspaceObservations({ 0: { keys: 2, expires: 1 }, 3: { keys: 1, expires: 0 } }, new Set())
      const second = keyspaceObservations({ 0: { keys: 5, expires: 1 } }, first.seen)
      expect(second.observations).toContainEqual({ name: "valkey.db.keys", value: 0, attributes: { "valkey.db.index": "3" } })
      expect(second.observations).toContainEqual({ name: "valkey.db.expires", value: 0, attributes: { "valkey.db.index": "3" } })
      expect(second.observations).toContainEqual({ name: "valkey.db.keys", value: 5, attributes: { "valkey.db.index": "0" } })
      expect(second.seen).toEqual(new Set(["0", "3"]))
    })

    it("does not change its inputs", () => {
      const current = { 1: { keys: 1, expires: 0 } }
      const seen = new Set(["0"])
      keyspaceObservations(current, seen)
      expect(seen).toEqual(new Set(["0"]))
      expect(current).toEqual({ 1: { keys: 1, expires: 0 } })
    })

    it("only uses valkey.db.index as an attribute", () => {
      const { observations } = keyspaceObservations({ 7: { keys: 1, expires: 1 } }, new Set())
      observations.forEach((o) => expect(Object.keys(o.attributes)).toEqual(["valkey.db.index"]))
    })
  })
})
