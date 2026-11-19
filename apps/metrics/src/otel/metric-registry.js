import * as R from "ramda"
import { toFiniteNumber } from "../utils/helpers.js"

/**
 * Maps the INFO fields the collector already polls to OpenTelemetry metrics.
 *
 * Names, instruments and units follow the OpenTelemetry semantic conventions:
 * amounts that add up across nodes (bytes, key counts) are UpDownCounters,
 * values that do not (peaks, ratios) are Gauges, and CPU time is a Counter.
 * Raw INFO values are exported as they are, and the backend derives ratios
 * and rates. Any INFO field that is not listed here is not exported.
 */

export const INSTRUMENT = {
  COUNTER: "counter",
  UP_DOWN_COUNTER: "updowncounter",
  GAUGE: "gauge",
}

const bytes = (name, field, instrument = INSTRUMENT.UP_DOWN_COUNTER) => ({ name, instrument, unit: "By", field })

/** `INFO MEMORY` fields. */
export const MEMORY_METRICS = [
  bytes("valkey.memory.used", "used_memory"),
  bytes("valkey.memory.used.overhead", "used_memory_overhead"),
  bytes("valkey.memory.used.dataset", "used_memory_dataset"),
  // A high-water mark since the process started, so it does not add up across nodes.
  bytes("valkey.memory.used.peak", "used_memory_peak", INSTRUMENT.GAUGE),
  bytes("valkey.memory.used.rss", "used_memory_rss"),
  bytes("valkey.memory.used.startup", "used_memory_startup"),
  // maxmemory 0 means "no limit", which is not a size.
  { ...bytes("valkey.memory.max", "maxmemory"), skipWhen: (value) => value === 0 },
  { name: "valkey.memory.fragmentation_ratio", instrument: INSTRUMENT.GAUGE, unit: "1", field: "mem_fragmentation_ratio" },
  bytes("valkey.memory.fragmentation_bytes", "mem_fragmentation_bytes"),
  bytes("valkey.memory.allocator_allocated", "allocator_allocated"),
  bytes("valkey.memory.allocator_active", "allocator_active"),
  bytes("valkey.memory.allocator_resident", "allocator_resident"),
  bytes("valkey.memory.allocator_frag_bytes", "allocator_frag_bytes"),
  bytes("valkey.memory.not_counted_for_evict", "mem_not_counted_for_evict"),
  bytes("valkey.memory.clients_normal", "mem_clients_normal"),
  bytes("valkey.memory.replication_backlog", "mem_replication_backlog"),
  bytes("valkey.memory.total_replication_buffers", "mem_total_replication_buffers"),
  bytes("valkey.memory.used.vm_eval", "used_memory_vm_eval"),
  bytes("valkey.memory.used.vm_functions", "used_memory_vm_functions"),
  {
    name: "valkey.memory.lazyfree_pending_objects",
    instrument: INSTRUMENT.UP_DOWN_COUNTER,
    unit: "{object}",
    field: "lazyfree_pending_objects",
  },
]

/**
 * `INFO CPU` pairs. Each pair comes from a different `getrusage` scope, and the
 * scopes overlap (the main thread is one of the process's threads), so each
 * scope is its own metric and a sum over one metric's attributes is correct.
 */
export const CPU_METRICS = [
  // RUSAGE_SELF: every thread of the server process.
  { name: "valkey.cpu.time", instrument: INSTRUMENT.COUNTER, unit: "s", user: "used_cpu_user", system: "used_cpu_sys" },
  // RUSAGE_THREAD: the main thread only. Not reported where the OS has no RUSAGE_THREAD (macOS).
  {
    name: "valkey.cpu.main_thread.time",
    instrument: INSTRUMENT.COUNTER,
    unit: "s",
    user: "used_cpu_user_main_thread",
    system: "used_cpu_sys_main_thread",
  },
  // RUSAGE_CHILDREN: forked children (for example BGSAVE) after they are reaped.
  {
    name: "valkey.cpu.children.time",
    instrument: INSTRUMENT.COUNTER,
    unit: "s",
    user: "used_cpu_user_children",
    system: "used_cpu_sys_children",
  },
]

/** `INFO KEYSPACE` values, one data point per `db<N>` row. */
export const KEYSPACE_METRICS = [
  { name: "valkey.db.keys", instrument: INSTRUMENT.UP_DOWN_COUNTER, unit: "{key}", field: "keys" },
  { name: "valkey.db.expires", instrument: INSTRUMENT.UP_DOWN_COUNTER, unit: "{key}", field: "expires" },
]

export const CPU_MODE = "cpu.mode"
export const DB_INDEX = "valkey.db.index"

const NO_ATTRIBUTES = Object.freeze({})

/** `[{ name, value, attributes }]` for the memory metrics present in `memory`. */
export const memoryObservations = (memory = {}) =>
  R.reduce((acc, metric) => {
    const value = toFiniteNumber(memory?.[metric.field])
    if (value === undefined || metric.skipWhen?.(value)) return acc
    acc.push({ name: metric.name, value, attributes: NO_ATTRIBUTES })
    return acc
  }, [], MEMORY_METRICS)

/** `[{ name, value, attributes }]` for the CPU pairs present in `cpu`, with `cpu.mode` user or system. */
export const cpuObservations = (cpu = {}) =>
  R.chain((metric) => R.reduce((acc, [mode, field]) => {
    const value = toFiniteNumber(cpu?.[field])
    if (value !== undefined) acc.push({ name: metric.name, value, attributes: { [CPU_MODE]: mode } })
    return acc
  }, [], [["user", metric.user], ["system", metric.system]]), CPU_METRICS)

/**
 * The keyspace points to report, and the updated set of indexes seen so far.
 *
 * INFO KEYSPACE has a row only for a database that holds keys, so a database
 * that is emptied leaves the reply. Its last count would otherwise stay in the
 * backend, so a database that was seen before reports 0.
 */
export const keyspaceObservations = (current = {}, seen = new Set()) => {
  const nextSeen = new Set([...seen, ...Object.keys(current)])
  const observations = R.chain((index) => {
    const row = current[index] ?? { keys: 0, expires: 0 }
    return KEYSPACE_METRICS.map((metric) => ({ name: metric.name, value: row[metric.field], attributes: { [DB_INDEX]: index } }))
  }, [...nextSeen].sort((a, b) => Number(a) - Number(b)))
  return { observations, seen: nextSeen }
}
