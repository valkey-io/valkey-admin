import * as R from "ramda"
import { InfoOptions } from "@valkey/valkey-glide"
import { COMMANDLOG_LARGE_REQUEST, COMMANDLOG_SLOW, COMMANDLOG_TYPE, COMMANDLOG_LARGE_REPLY } from "../utils/constants.js"
import {
  normalizeNodeScopedResponse,
  parseCommandLogs,
  parseInfo,
  parseInfoToPairs,
  parseKeyspace,
  toFiniteNumber
} from "../utils/helpers.js"
import { createLogger } from "../utils/logger.js"

// todo a proper schema; all this parsing logic with `kv` and `kvPairsToRows` feels extremely fragile
const kvPairsToRows = R.curry((ts, pairs) =>
  pairs.map(([k, v]) => ({ ts, metric: String(k).replace(/\./g, "_"), value: Number(v) })))
const log = createLogger("fetchers")
const debugMetrics = process.env.DEBUG_METRICS === "1"

// Keeps the pairs whose value is a finite number, with the value as a number.
const finitePairs = (pairs) => R.reduce((acc, [key, value]) => {
  const parsed = toFiniteNumber(value)
  if (parsed !== undefined) acc.push([key, parsed])
  return acc
}, [], pairs)

export const makeFetcher = (client, { onInfo } = {}) => {
  // Hands the parsed INFO maps to the OTel export. The hook must never cost a
  // collection cycle, so an error in it is logged and the rows are still returned.
  const notify = (kind, buildData) => {
    if (!onInfo) return
    try {
      onInfo(kind, buildData())
    } catch (err) {
      log.error(`[${kind}] export hook failed: ${err?.message || err}`)
    }
  }

  return {
    memory: async () => {
      const memoryInfo = normalizeNodeScopedResponse(
        await client.info([InfoOptions.Memory]),
      )
      const keyspaceInfo = normalizeNodeScopedResponse(
        await client.info([InfoOptions.Keyspace]),
      )
      if (debugMetrics) {
        log.info("[memory] raw info preview", String(memoryInfo).split(/\r?\n/).slice(0, 20).join("\n"))
        log.info("[memory] raw keyspace preview", String(keyspaceInfo).split(/\r?\n/).slice(0, 10).join("\n"))
      }
      const ts = Date.now()
      const metrics = parseInfo(memoryInfo)
      const keyspace = parseKeyspace(parseInfoToPairs(keyspaceInfo))
      notify("memory", () => ({ memory: metrics, keyspace }))
      // The dashboard reads the default database only.
      const keysCount = keyspace["0"]?.keys
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
          keysCount > 0 && metrics.used_memory_dataset
            ? Number(metrics.used_memory_dataset) / keysCount
            : null,
        ],
      ]
      const rows = R.pipe(finitePairs, kvPairsToRows(ts))(derivedPairs)
      if (debugMetrics) {
        log.info("[memory] normalized row count", rows.length)
        log.info("[memory] normalized row preview", rows.slice(0, 10))
      }
      return rows
    },

    cpu: async () => {
      const raw = normalizeNodeScopedResponse(
        await client.info([InfoOptions.Cpu]),
      )
      const ts = Date.now()
      notify("cpu", () => parseInfo(raw))

      return R.pipe(parseInfoToPairs, finitePairs, kvPairsToRows(ts))(raw)
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
  }
}
