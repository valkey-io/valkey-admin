import { CPU_HIGH_THRESHOLD, CPU_NORMAL_THRESHOLD,
  MEMORY_HIGH_THRESHOLD, MEMORY_NORMAL_THRESHOLD } from "@common/src/constants.ts"

export type UtilizationLevel = "low" | "normal" | "high"

const LEVEL_RANK: Record<UtilizationLevel, number> = { low: 0, normal: 1, high: 2 }

// Memory and CPU get their own bands: a cache is meant to sit near its
// memory limit, but a hot event loop is not meant to sit near one core.
function levelFor(
  percent: number | null | undefined,
  normalThreshold: number,
  highThreshold: number,
): UtilizationLevel | null {
  if (percent === null || percent === undefined) return null
  if (percent >= highThreshold) return "high"
  if (percent >= normalThreshold) return "normal"
  return "low"
}

// Worst of the two, so 30% memory with 90% cpu is "high".
export function getUtilizationLevel(
  memoryPercent: number | null | undefined,
  cpuPercent: number | null | undefined,
): UtilizationLevel | null {
  const levels = [
    levelFor(memoryPercent, MEMORY_NORMAL_THRESHOLD, MEMORY_HIGH_THRESHOLD),
    levelFor(cpuPercent, CPU_NORMAL_THRESHOLD, CPU_HIGH_THRESHOLD),
  ].filter((level): level is UtilizationLevel => level !== null)

  if (levels.length === 0) return null
  return levels.reduce((worst, level) => (LEVEL_RANK[level] > LEVEL_RANK[worst] ? level : worst))
}

export function formatRate(value: number): string {
  return `${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)}/s`
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return `${value.toFixed(1)}%`
}
