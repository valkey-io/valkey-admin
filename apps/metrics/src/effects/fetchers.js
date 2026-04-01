import * as R from "ramda"
import { InfoOptions } from "@valkey/valkey-glide"
import { COMMANDLOG_LARGE_REQUEST, COMMANDLOG_SLOW, COMMANDLOG_TYPE, COMMANDLOG_LARGE_REPLY } from "../utils/constants.js"
import { parseCommandLogs } from "../utils/helpers.js"
import { createLogger } from "../utils/logger.js"

// todo a proper schema; all this parsing logic with `kv` and `kvPairsToRows` feels extremely fragile
const kvPairsToRows = R.curry((ts, pairs) =>
  pairs.map(([k, v]) => ({ ts, metric: String(k).replace(/\./g, "_"), value: Number(v) })))
const log = createLogger("fetchers")
const debugMetrics = process.env.DEBUG_METRICS === "1"

// Cluster responses may be keyed by node address; this builds the expected key for the local Valkey node.
const getPreferredNodeKey = () => {
  const host = process.env.VALKEY_HOST
  const port = process.env.VALKEY_PORT
  return host && port ? `${host}:${port}` : null
}

// Cluster clients may return a per-node map; pick the entry for this sidecar's local Valkey node.
const normalizeNodeScopedResponse = (result) => {
  if (Array.isArray(result) || typeof result === "string" || result == null) {
    return result
  }

  if (typeof result === "object") {
    const preferredNodeKey = getPreferredNodeKey()
    if (preferredNodeKey && preferredNodeKey in result) {
      return result[preferredNodeKey]
    }

    // If the local node key is missing, keep going with the first node entry instead of pushing the map downstream.
    const firstValue = Object.values(result)[0]
    return firstValue ?? result
  }

  return result
}

const parseInfoToPairs = (raw) =>
  R.pipe(
    R.defaultTo(""),
    R.split(/\r?\n/),
    R.into(
      [],
      R.compose(
        R.map(R.trim),
        R.reject(R.either(R.isEmpty, R.startsWith("#"))),
        R.filter(R.includes(":")),
        R.map((line) => line.split(":", 2)),
      ),
    ),
  )(raw)

// INFO KEYSPACE reports per-database stats like `db0:keys=...`; this app reads the default database only.
const parseKeyCount = R.pipe(
  parseInfoToPairs,
  R.find(([key]) => key === "db0"),
  R.nth(1),
  (value) => {
    const match = String(value).match(/keys=(\d+)/)
    return match ? Number(match[1]) : null
  },
)

export const makeFetcher = (client) => ({
  memory_stats: async () => {
    const memoryInfo = normalizeNodeScopedResponse(
      await client.info([InfoOptions.Memory]),
    )
    const keyspaceInfo = normalizeNodeScopedResponse(
      await client.info([InfoOptions.Keyspace]),
    )
    if (debugMetrics) {
      log.info("[memory_stats] raw info preview", String(memoryInfo).split(/\r?\n/).slice(0, 20).join("\n"))
      log.info("[memory_stats] raw keyspace preview", String(keyspaceInfo).split(/\r?\n/).slice(0, 10).join("\n"))
    }
    const ts = Date.now()
    const metrics = Object.fromEntries(parseInfoToPairs(memoryInfo))
    const keysCount = parseKeyCount(keyspaceInfo)
    const derivedPairs = [
      ["used_memory", metrics.used_memory],
      ["allocator_active", metrics.allocator_active],
      ["allocator_resident", metrics.allocator_resident],
      ["peak_allocated", metrics.used_memory_peak],
      ["dataset_bytes", metrics.used_memory_dataset],
      ["overhead_total", metrics.used_memory_overhead],
      ["dataset_percentage", metrics.used_memory_dataset_perc?.replace("%", "")],
      ["fragmentation", metrics.mem_fragmentation_ratio],
      ["fragmentation_bytes", metrics.mem_fragmentation_bytes],
      ["allocator_rss_ratio", metrics.allocator_rss_ratio],
      ["keys_count", keysCount],
      [
        "keys_bytes_per_key",
        keysCount && Number(keysCount) > 0 && metrics.used_memory_dataset
          ? Number(metrics.used_memory_dataset) / Number(keysCount)
          : null,
      ],
    ]
    const rows = R.pipe(
      R.map(([key, value]) => [key, +value]),
      R.filter(([, v]) => Number.isFinite(v)), // remove NaN or non-numbers
      kvPairsToRows(ts),
    )(derivedPairs)
    if (debugMetrics) {
      log.info("[memory_stats] normalized row count", rows.length)
      log.info("[memory_stats] normalized row preview", rows.slice(0, 10))
    }
    return rows
  },

  info_cpu: async () => {
    const raw = normalizeNodeScopedResponse(
      await client.info([InfoOptions.Cpu]),
    )
    const ts = Date.now()

    return R.pipe(
      parseInfoToPairs,
      R.reduce((acc, [key, value]) => {
        const parsedValue = Number((value || "").trim())
        if (Number.isFinite(parsedValue)) acc.push([key, parsedValue])
        return acc
      }, []),
      kvPairsToRows(ts),
    )(raw)
  },

  commandlog_slow: async (count = 50) => {
    const entries = normalizeNodeScopedResponse(
      await client.customCommand(["COMMANDLOG", "GET", String(count), COMMANDLOG_TYPE.SLOW]),
    )
    const values = parseCommandLogs(entries, COMMANDLOG_TYPE.SLOW)
    return [{ ts: Date.now(), metric: COMMANDLOG_SLOW, values }]
  },

  commandlog_large_reply: async (count = 50) => {
    const entries = normalizeNodeScopedResponse(
      await client.customCommand(["COMMANDLOG", "GET", String(count), COMMANDLOG_TYPE.LARGE_REPLY]),
    )
    const values = parseCommandLogs(entries, COMMANDLOG_TYPE.LARGE_REPLY)
    return [{ ts: Date.now(), metric: COMMANDLOG_LARGE_REPLY, values }]
  },

  commandlog_large_request: async (count = 50) => {
    const entries = normalizeNodeScopedResponse(
      await client.customCommand(["COMMANDLOG", "GET", String(count), COMMANDLOG_TYPE.LARGE_REQUEST]),
    )
    const values = parseCommandLogs(entries, COMMANDLOG_TYPE.LARGE_REQUEST)
    return [{ ts: Date.now(), metric: COMMANDLOG_LARGE_REQUEST, values }]
  },
})
