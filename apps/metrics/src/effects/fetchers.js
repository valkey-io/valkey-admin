import * as R from "ramda"
import { COMMANDLOG_LARGE_REQUEST, COMMANDLOG_SLOW, COMMANDLOG_TYPE, COMMANDLOG_LARGE_REPLY } from "../utils/constants.js"
import { parseCommandLogs } from "../utils/helpers.js"

// todo a proper schema; all this parsing logic with `kv` and `kvPairsToRows` feels extremely fragile
const kvPairsToRows = R.curry((ts, pairs) =>
  pairs.map(([k, v]) => ({ ts, metric: String(k).replace(/\./g, "_"), value: Number(v) })))

export const makeFetcher = (client) => ({
  memory_stats: async () => {
    const result = await client.customCommand(["MEMORY", "STATS"])
    const ts = Date.now()

    return R.pipe(
      R.defaultTo([]),
      R.ifElse(
        Array.isArray,
        R.splitEvery(2), // it seems the results are pairs
        R.toPairs, // otherwise, get entries if it's an object; an exception if it's a string lol (shouldn't happen)
      ),
      // let's convert values to numbers and filter out NaN further down
      R.map(([k, v]) => [k, +v]),
      // shortcut to check if it's a number without rejecting floats (like fragmentation_ratio)
      R.filter(([, v]) => Number.isFinite(v)),
      kvPairsToRows(ts),
    )(result)
  },

  info_cpu: async () => {
    const raw = await client.info("CPU")
    const ts = Date.now()

    return R.pipe(
      R.split(/\r?\n/),
      R.into(
        [],
        R.compose(
          R.map(R.trim),
          // section headers start with "#", like "# CPU", we don't need them — just like empty lines
          R.reject(R.either(R.isEmpty, R.startsWith("#"))),
          R.filter(R.includes(":")),
          R.map((l) => l.split(":", 2)),
          R.map(([k, v]) => [k, Number((v || "").trim())]),
          R.filter(([, n]) => Number.isFinite(n)),
        ),
      ),
      kvPairsToRows(ts),
    )(raw)
  },

  commandlog_slow: async (count = 50) => {
    const entries = await client.customCommand(["COMMANDLOG", "GET", String(count), COMMANDLOG_TYPE.SLOW])
    const values = parseCommandLogs(entries, COMMANDLOG_TYPE.SLOW)
    return [{ ts: Date.now(), metric: COMMANDLOG_SLOW, values }]
  },

  commandlog_large_reply: async (count = 50) => {
    const entries = await client.customCommand(["COMMANDLOG", "GET", String(count), COMMANDLOG_TYPE.LARGE_REPLY])
    const values = parseCommandLogs(entries, COMMANDLOG_TYPE.LARGE_REPLY)
    return [{ ts: Date.now(), metric: COMMANDLOG_LARGE_REPLY, values }]
  },

  commandlog_large_request: async (count = 50) => {
    const entries = await client.customCommand(["COMMANDLOG", "GET", String(count), COMMANDLOG_TYPE.LARGE_REQUEST])
    const values = parseCommandLogs(entries, COMMANDLOG_TYPE.LARGE_REQUEST)
    return [{ ts: Date.now(), metric: COMMANDLOG_LARGE_REQUEST, values }]
  },
})
