/**
 * Analysis Engine — data-driven health analyzer for Valkey metrics.
 *
 * The health score is computed as a weighted sum of independent metric
 * categories. Each category earns a fraction of its max weight based on the
 * real metric value, so the score and narrative move continuously as metrics
 * change. Every category also emits the reasoning used to derive its points.
 *
 * Weights (sum to 100):
 *   Cache Efficiency      25
 *   Memory                20
 *   Client Health         22
 *   Command Throughput    18
 *   Data Lifecycle        15
 */

export interface ScoreCategory {
  /** Display name, e.g. "Cache Efficiency" */
  label: string
  /** Points earned (0..max), rounded */
  earned: number
  /** Maximum points this category can contribute */
  max: number
  /** Human-readable reason for the points earned */
  reason: string
  /** Severity used for UI coloring */
  status: "good" | "warn" | "critical" | "unknown"
}

export interface AnalysisResult {
  healthScore: number
  /** Per-category contribution to the score */
  breakdown: ScoreCategory[]
  rootCause: string
  riskAssessment: string
  issues: string[]
  recommendations: string[]
  optimizations: string[]
  /** 0..100 — how much of the analysis was backed by real data */
  confidence: number
  /** ISO timestamp of when the analysis ran */
  timestamp: string
}

interface MetricsData {
  [key: string]: unknown
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const has = (v: unknown): boolean => v !== null && v !== undefined && v !== ""

/**
 * Map a normalized 0..1 quality value to points out of `max`.
 */
const pts = (quality: number, max: number): number =>
  Math.round(Math.max(0, Math.min(1, quality)) * max)

export function analyzeDatabase(data: MetricsData): AnalysisResult {
  const issues: string[] = []
  const recommendations: string[] = []
  const optimizations: string[] = []
  const rootCauseCandidates: { severity: number; text: string }[] = []
  const riskCandidates: { severity: number; text: string }[] = []
  const breakdown: ScoreCategory[] = []

  // Track data availability for the confidence indicator.
  let availableSignals = 0
  const totalSignals = 7

  // ── 1. Cache Efficiency (max 25) ────────────────────────────────────────────
  const hits = num(data.keyspace_hits)
  const misses = num(data.keyspace_misses)
  const totalReads = hits + misses
  {
    const max = 25
    if (totalReads > 0) {
      availableSignals++
      const hitRatio = (hits / totalReads) * 100
      // quality scales linearly: 0% ratio → 0 pts, 90%+ ratio → full pts
      const quality = hitRatio / 90
      const earned = pts(quality, max)
      let status: ScoreCategory["status"] = "good"
      let reason = `Hit ratio ${hitRatio.toFixed(1)}% across ${totalReads.toLocaleString()} reads`

      if (hitRatio < 20) {
        status = "critical"
        issues.push(`Critical: cache hit ratio is ${hitRatio.toFixed(1)}% (target ≥ 80%)`)
        recommendations.push("Add TTLs and pre-warm hot keys — most reads are missing cache")
        optimizations.push("Adopt a read-through caching pattern for hot paths")
        rootCauseCandidates.push({ severity: 90 - hitRatio, text: `Cache hit ratio of ${hitRatio.toFixed(1)}% means the cache is rarely serving reads, forcing expensive backing-store lookups.` })
        riskCandidates.push({ severity: 90 - hitRatio, text: "Read latency climbs and backing store load grows as cache misses dominate." })
      } else if (hitRatio < 50) {
        status = "warn"
        issues.push(`Warning: cache hit ratio is ${hitRatio.toFixed(1)}% (target ≥ 80%)`)
        recommendations.push("Increase key retention / TTLs to raise the hit ratio")
        optimizations.push("Profile most-missed key prefixes and pre-load them")
        rootCauseCandidates.push({ severity: 90 - hitRatio, text: `A ${hitRatio.toFixed(1)}% hit ratio indicates moderate cache inefficiency.` })
        riskCandidates.push({ severity: 60, text: "Performance degrades further under increased load." })
      } else if (hitRatio < 80) {
        status = "warn"
        optimizations.push(`Hit ratio ${hitRatio.toFixed(1)}% — pre-warming could push it past 80%`)
      } else {
        optimizations.push(`Strong hit ratio (${hitRatio.toFixed(1)}%) — cache is doing its job`)
      }
      breakdown.push({ label: "Cache Efficiency", earned, max, reason, status })
    } else {
      // No read traffic — can't judge cache. Award neutral-favorable but flag unknown.
      breakdown.push({
        label: "Cache Efficiency",
        earned: Math.round(max * 0.6),
        max,
        reason: "No read traffic yet — cache efficiency unproven",
        status: "unknown",
      })
      optimizations.push("Generate read traffic to evaluate cache efficiency")
    }
  }

  // ── 2. Memory (max 20) ──────────────────────────────────────────────────────
  const usedMemory = num(data.used_memory)
  const maxMemory = num(data.maxmemory)
  const totalSystemMemory = num(data.total_system_memory)
  const memoryLimit = maxMemory > 0 ? maxMemory : totalSystemMemory
  {
    const max = 20
    if (usedMemory > 0 && memoryLimit > 0) {
      availableSignals++
      const memPct = (usedMemory / memoryLimit) * 100
      // quality: ≤60% util → full pts, 100% util → 0 pts
      const quality = (100 - memPct) / 40
      const earned = pts(quality, max)
      let status: ScoreCategory["status"] = "good"
      const reason = `Using ${(usedMemory / 1048576).toFixed(1)} MB of ${(memoryLimit / 1048576).toFixed(0)} MB (${memPct.toFixed(0)}%)`

      if (memPct > 90) {
        status = "critical"
        issues.push(`Critical: memory at ${memPct.toFixed(0)}% of limit`)
        recommendations.push("Raise maxmemory or evict stale data immediately")
        recommendations.push("Audit large keys with MEMORY USAGE <key>")
        rootCauseCandidates.push({ severity: memPct, text: `Memory utilization is ${memPct.toFixed(0)}%, leaving little headroom before evictions or write rejection.` })
        riskCandidates.push({ severity: memPct, text: "Out-of-memory risk — the server may start rejecting writes." })
      } else if (memPct > 75) {
        status = "warn"
        issues.push(`Warning: memory at ${memPct.toFixed(0)}% of limit`)
        recommendations.push("Set an eviction policy (e.g. allkeys-lru) as a safety net")
        optimizations.push("Track memory growth trend to forecast capacity")
        riskCandidates.push({ severity: memPct - 30, text: "Traffic spikes could push memory into the eviction zone." })
      } else {
        optimizations.push(`Memory healthy at ${memPct.toFixed(0)}% — comfortable headroom`)
      }
      breakdown.push({ label: "Memory", earned, max, reason, status })
    } else {
      breakdown.push({
        label: "Memory",
        earned: Math.round(max * 0.6),
        max,
        reason: "Memory limit not reported — utilization unknown",
        status: "unknown",
      })
    }
  }

  // ── 3. Client Health (max 22) ────────────────────────────────────────────────
  const connectedClients = num(data.connected_clients)
  const rejectedConnections = num(data.rejected_connections)
  const blockedClients = num(data.blocked_clients)
  {
    const max = 22
    if (has(data.connected_clients)) {
      availableSignals++
      let quality = 1
      let status: ScoreCategory["status"] = "good"
      const reasonParts = [`${connectedClients} connected`]

      // Connected clients pressure
      if (connectedClients > 500) {
        quality -= 0.5
        status = "critical"
        issues.push(`Critical: ${connectedClients} connected clients`)
        recommendations.push("Introduce connection pooling (50–100 conns per app instance)")
        rootCauseCandidates.push({ severity: 70, text: `${connectedClients} concurrent client connections consume significant per-connection memory and file descriptors.` })
        riskCandidates.push({ severity: 70, text: "File-descriptor exhaustion can cause new connections to fail." })
      } else if (connectedClients > 100) {
        quality -= 0.25
        status = "warn"
        recommendations.push("Consider connection pooling to reduce client count")
      }

      // Rejected connections
      if (rejectedConnections > 0) {
        availableSignals += 0 // counted within client health
        quality -= 0.35
        status = status === "good" ? "warn" : status
        issues.push(`Warning: ${rejectedConnections} rejected connections`)
        recommendations.push("Raise the maxclients limit — connections are being refused")
        rootCauseCandidates.push({ severity: 80, text: `${rejectedConnections} connections were rejected, indicating the maxclients ceiling was hit.` })
        riskCandidates.push({ severity: 80, text: "Application requests fail outright when connections are rejected." })
        reasonParts.push(`${rejectedConnections} rejected`)
      }

      // Blocked clients
      if (blockedClients > 10) {
        quality -= 0.15
        status = status === "good" ? "warn" : status
        issues.push(`Warning: ${blockedClients} blocked clients`)
        optimizations.push("Review BLPOP/BRPOP usage — many clients are blocking")
        reasonParts.push(`${blockedClients} blocked`)
      }

      if (status === "good") {
        optimizations.push(`Client load healthy (${connectedClients} connections)`)
      }

      breakdown.push({
        label: "Client Health",
        earned: pts(quality, max),
        max,
        reason: reasonParts.join(", "),
        status,
      })
    } else {
      breakdown.push({ label: "Client Health", earned: Math.round(max * 0.6), max, reason: "Client metrics unavailable", status: "unknown" })
    }
  }

  // ── 4. Command Throughput (max 18) ────────────────────────────────────────────
  const totalCommands = num(data.total_commands_processed)
  const totalErrors = num(data.total_error_replies)
  {
    const max = 18
    if (totalCommands > 0) {
      availableSignals++
      const errorRate = totalCommands > 0 ? (totalErrors / totalCommands) * 100 : 0
      // quality is driven by error rate: 0% errors → full, ≥5% errors → 0
      const quality = 1 - errorRate / 5
      const earned = pts(quality, max)
      let status: ScoreCategory["status"] = "good"
      const reason = `${totalCommands.toLocaleString()} commands processed, ${errorRate.toFixed(2)}% error replies`

      if (errorRate > 5) {
        status = "critical"
        issues.push(`Critical: ${errorRate.toFixed(1)}% of commands returned errors`)
        recommendations.push("Inspect application command usage — high error-reply rate")
        rootCauseCandidates.push({ severity: 60 + errorRate, text: `An error-reply rate of ${errorRate.toFixed(1)}% suggests malformed commands or misuse.` })
        riskCandidates.push({ severity: 50, text: "Elevated error rate signals client bugs or schema drift." })
      } else if (errorRate > 1) {
        status = "warn"
        optimizations.push(`Error-reply rate ${errorRate.toFixed(2)}% — worth investigating`)
      } else {
        optimizations.push(`Throughput healthy — ${totalCommands.toLocaleString()} commands, minimal errors`)
      }
      breakdown.push({ label: "Command Throughput", earned, max, reason, status })
    } else {
      breakdown.push({ label: "Command Throughput", earned: Math.round(max * 0.6), max, reason: "No command traffic recorded yet", status: "unknown" })
    }
  }

  // ── 5. Data Lifecycle (max 15) — evictions + key hygiene ──────────────────────
  const evictedKeys = num(data.evicted_keys)
  const expiredKeys = num(data.expired_keys)
  const keysCount = num(data.keys_count)
  const bytesPerKey = num(data.bytes_per_key)
  {
    const max = 15
    if (has(data.evicted_keys) || keysCount > 0) {
      availableSignals++
      let quality = 1
      let status: ScoreCategory["status"] = "good"
      const reasonParts: string[] = []

      if (evictedKeys > 1000) {
        quality -= 0.6
        status = "critical"
        issues.push(`Critical: ${evictedKeys.toLocaleString()} keys evicted`)
        recommendations.push("Increase memory or add explicit TTLs — heavy eviction in progress")
        rootCauseCandidates.push({ severity: 75, text: `${evictedKeys.toLocaleString()} evicted keys show the dataset exceeds available memory.` })
        riskCandidates.push({ severity: 65, text: "Eviction silently drops data that applications may expect to exist." })
        reasonParts.push(`${evictedKeys.toLocaleString()} evicted`)
      } else if (evictedKeys > 0) {
        quality -= 0.25
        status = "warn"
        issues.push(`Notice: ${evictedKeys.toLocaleString()} keys evicted`)
        optimizations.push("Confirm the eviction policy matches your access pattern")
        reasonParts.push(`${evictedKeys.toLocaleString()} evicted`)
      }

      if (keysCount > 0) reasonParts.push(`${keysCount.toLocaleString()} keys`)
      if (expiredKeys > 0) reasonParts.push(`${expiredKeys.toLocaleString()} expired`)

      // Key hygiene heuristics
      if (bytesPerKey > 10240 && keysCount > 100) {
        quality -= 0.15
        status = status === "good" ? "warn" : status
        optimizations.push(`Avg key size ${(bytesPerKey / 1024).toFixed(1)} KB — audit large hashes/sorted sets`)
      }
      if (keysCount > 1_000_000) {
        optimizations.push("Over 1M keys — consider namespacing and periodic cleanup")
      }
      // Low expiry activity with a sizable keyspace hints at missing TTLs
      if (keysCount > 1000 && expiredKeys === 0 && evictedKeys === 0) {
        optimizations.push("No keys are expiring — many keys may lack TTLs (run: find keys without TTL)")
      }

      if (status === "good") optimizations.push("Data lifecycle healthy — no eviction pressure")

      breakdown.push({
        label: "Data Lifecycle",
        earned: pts(quality, max),
        max,
        reason: reasonParts.length ? reasonParts.join(", ") : "No eviction or expiry pressure",
        status,
      })
    } else {
      breakdown.push({ label: "Data Lifecycle", earned: Math.round(max * 0.6), max, reason: "Keyspace metrics unavailable", status: "unknown" })
    }
  }

  // ── Synthesize score ──────────────────────────────────────────────────────────
  const healthScore = breakdown.reduce((sum, c) => sum + c.earned, 0)

  // Root cause = highest-severity contributor, else healthy message.
  rootCauseCandidates.sort((a, b) => b.severity - a.severity)
  riskCandidates.sort((a, b) => b.severity - a.severity)

  const rootCause = rootCauseCandidates.length > 0
    ? rootCauseCandidates[0].text
    : `Score ${healthScore}/100 — all measured categories are within healthy ranges. ` +
      `Leading contributors: ${[...breakdown].sort((a, b) => b.earned - a.earned).slice(0, 2).map((c) => `${c.label} (${c.earned}/${c.max})`).join(", ")}.`

  const riskAssessment = riskCandidates.length > 0
    ? riskCandidates[0].text
    : "Low risk — the database is operating within normal parameters across all measured signals."

  if (issues.length === 0) recommendations.push("No action required — keep monitoring trends")
  if (optimizations.length === 0) optimizations.push("No optimization opportunities identified")

  // Confidence reflects how much of the analysis used real data.
  const confidence = Math.round((availableSignals / totalSignals) * 100)

  return {
    healthScore,
    breakdown,
    rootCause,
    riskAssessment,
    issues,
    recommendations: Array.from(new Set(recommendations)),
    optimizations: Array.from(new Set(optimizations)),
    confidence,
    timestamp: new Date().toISOString(),
  }
}
