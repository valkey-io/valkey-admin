import * as R from "ramda"
import { type ParsedClusterInfo } from "./utils"

export type MemoryBasis = "maxmemory" | "total_system_memory" | "none"

export type InfoFields = Record<string, string>

export type InfoSections = Record<string, InfoFields>

export type CpuSample = {
  ts: number
  totalCpuSeconds: number
}

export type NodeUtilization = {
  nodeId: string
  memory_utilization_percent: number | null
  memory_basis: MemoryBasis
  used_memory: number | null
  memory_limit_bytes: number | null
  cpu_utilization_percent: number | null
  cpu_sample_interval_seconds: number | null
  warnings: string[]
}

type MemoryUtilization = Pick<
  NodeUtilization,
  "memory_utilization_percent" | "memory_basis" | "used_memory" | "memory_limit_bytes"
> & { warnings: string[] }

type CpuUtilization = Pick<
  NodeUtilization,
  "cpu_utilization_percent" | "cpu_sample_interval_seconds"
> & { warnings: string[] }

type FieldRead =
  | { status: "ok"; value: number }
  | { status: "missing" }
  | { status: "unparseable" }

const STALE_CPU_SAMPLE_MS = 5 * 60 * 1000

// Concurrent pollers share this map, so ignore diffs taken too close together.
const MIN_CPU_SAMPLE_MS = 1000

const MEMORY_SECTION = "Memory"
const CPU_SECTION = "CPU"

const cpuSamples: Map<string, CpuSample> = new Map()

// Drop retained samples so a reconnecting node re-baselines.
export const clearCpuSamples = (nodeId?: string): void => {
  if (nodeId === undefined) cpuSamples.clear()
  else cpuSamples.delete(nodeId)
}

// Two-decimal rounding for percentages.
export const round2 = (value: number): number => Math.round(value * 100) / 100

// Read one INFO field, separating absent from non-numeric.
const readNumericField = (fields: InfoFields, key: string): FieldRead => {
  const raw = fields[key]
  if (raw === undefined) return { status: "missing" }

  const value = Number(raw.trim())
  return Number.isFinite(value) ? { status: "ok", value } : { status: "unparseable" }
}

// Describe a failed read as a warning string.
const describeFieldIssue = (key: string, read: FieldRead): string | null => {
  if (read.status === "missing") return `${key} missing from INFO`
  if (read.status === "unparseable") return `${key} is not numeric`
  return null
}

// Unwrap a read, falling back when unusable.
const valueOr = (read: FieldRead, fallback: number): number =>
  read.status === "ok" ? read.value : fallback

// Memory used against maxmemory, or host RAM when unset.
export const calculateMemoryUtilization = (fields: InfoFields): MemoryUtilization => {
  const usedRead = readNumericField(fields, "used_memory")
  const maxRead = readNumericField(fields, "maxmemory")
  const systemRead = readNumericField(fields, "total_system_memory")

  const warnings = [
    describeFieldIssue("used_memory", usedRead),
    describeFieldIssue("maxmemory", maxRead),
  ].filter((warning): warning is string => warning !== null)

  const usedMemory = usedRead.status === "ok" ? usedRead.value : null
  const maxMemory = valueOr(maxRead, 0)
  const systemMemory = valueOr(systemRead, 0)

  const [basis, limit]: [MemoryBasis, number | null] =
    maxMemory > 0
      ? ["maxmemory", maxMemory]
      : systemMemory > 0
        ? ["total_system_memory", systemMemory]
        : ["none", null]

  if (basis === "none") {
    warnings.push("no memory limit reported; utilization percent unavailable")
  }

  return {
    memory_utilization_percent:
      usedMemory !== null && limit !== null ? round2((usedMemory / limit) * 100) : null,
    memory_basis: basis,
    used_memory: usedMemory,
    memory_limit_bytes: limit,
    warnings,
  }
}

// Sum a pair of cumulative CPU counters into a timestamped sample.
const readCpuCounters = (
  fields: InfoFields,
  sysKey: string,
  userKey: string,
  now: number,
): CpuSample | null => {
  const sysRead = readNumericField(fields, sysKey)
  const userRead = readNumericField(fields, userKey)

  if (sysRead.status !== "ok" || userRead.status !== "ok") return null

  return { ts: now, totalCpuSeconds: sysRead.value + userRead.value }
}

// Prefer the main thread counters: command execution is single threaded, so
// they are bounded by one core. The process wide totals include io and
// background threads, which inflates the percentage past 100 on idle nodes.
export const readCpuSample = (fields: InfoFields, now: number): CpuSample | null =>
  readCpuCounters(fields, "used_cpu_sys_main_thread", "used_cpu_user_main_thread", now) ??
  readCpuCounters(fields, "used_cpu_sys", "used_cpu_user", now)

// Empty CPU result carrying why no percentage exists.
const noCpuUtilization = (warnings: string[]): CpuUtilization => ({
  cpu_utilization_percent: null,
  cpu_sample_interval_seconds: null,
  warnings,
})

// Diff two samples into percent of one core; reject stale or reset counters.
export const calculateCpuUtilization = (
  previous: CpuSample | null,
  next: CpuSample,
): CpuUtilization => {
  if (previous === null) return noCpuUtilization([])

  const elapsedMs = next.ts - previous.ts
  if (elapsedMs <= 0) return noCpuUtilization(["cpu samples share a timestamp"])
  if (elapsedMs < MIN_CPU_SAMPLE_MS) return noCpuUtilization([])
  if (elapsedMs > STALE_CPU_SAMPLE_MS) {
    return noCpuUtilization(["previous cpu sample too old to compare against"])
  }

  const cpuSecondsElapsed = next.totalCpuSeconds - previous.totalCpuSeconds
  if (cpuSecondsElapsed < 0) {
    return noCpuUtilization(["cpu counters went backwards; server likely restarted"])
  }

  const intervalSeconds = elapsedMs / 1000

  return {
    cpu_utilization_percent: round2((cpuSecondsElapsed / intervalSeconds) * 100),
    cpu_sample_interval_seconds: round2(intervalSeconds),
    warnings: [],
  }
}

// Memory plus CPU for one node, retaining this sample for the next poll.
export const computeNodeUtilization = (
  nodeId: string,
  sections: InfoSections,
  now: number = Date.now(),
): NodeUtilization => {
  const memory = calculateMemoryUtilization(sections[MEMORY_SECTION] ?? {})
  const nextSample = readCpuSample(sections[CPU_SECTION] ?? {}, now)
  const previousSample = cpuSamples.get(nodeId) ?? null

  const cpu =
    nextSample === null
      ? noCpuUtilization(["cpu counters missing from INFO"])
      : calculateCpuUtilization(previousSample, nextSample)

  // Keep the older baseline when the diff was rejected for being too recent.
  const isTooSoon =
    previousSample !== null &&
    nextSample !== null &&
    nextSample.ts - previousSample.ts < MIN_CPU_SAMPLE_MS

  if (nextSample !== null && !isTooSoon) cpuSamples.set(nodeId, nextSample)

  return {
    nodeId,
    memory_utilization_percent: memory.memory_utilization_percent,
    memory_basis: memory.memory_basis,
    used_memory: memory.used_memory,
    memory_limit_bytes: memory.memory_limit_bytes,
    cpu_utilization_percent: cpu.cpu_utilization_percent,
    cpu_sample_interval_seconds: cpu.cpu_sample_interval_seconds,
    warnings: [...memory.warnings, ...cpu.warnings],
  }
}

// Utilization for every node in a parsed cluster INFO response.
export const computeClusterUtilization = (
  clusterInfo: ParsedClusterInfo,
  now: number = Date.now(),
): Record<string, NodeUtilization> =>
  R.mapObjIndexed(
    (sections, nodeId) => computeNodeUtilization(nodeId, sections, now),
    clusterInfo,
  )
