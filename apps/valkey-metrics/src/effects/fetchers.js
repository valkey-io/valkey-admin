import * as R from "ramda"

// todo a proper schema; all this parsing logic with `kv` and `kvPairsToRows` feels extremely fragile
const kvPairsToRows = R.curry((ts, pairs) =>
  pairs.map(([k, v]) => ({ ts, metric: String(k).replace(/\./g, "_"), value: Number(v) })))

export const makeFetcher = client => ({
  memory_stats: async () => {
    const result = await client.sendCommand(["MEMORY", "STATS"])
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
          R.map(l => l.split(":", 2)),
          R.map(([k, v]) => [k, Number((v || "").trim())]),
          R.filter(([, n]) => Number.isFinite(n))
        )
      ),
      kvPairsToRows(ts),
    )(raw)
  },

  slowlog_get: async (count = 50) => {
    const entries = await client.sendCommand(["SLOWLOG", "GET", String(count)])
    const values = entries.map((e = []) => {
      const [id, tsSec, durationUs, argv = [], addr = "unknown", name = "unknown"] = e
      return {
        id: String(id),
        ts: Number(tsSec) * 1000,
        duration_us: Number(durationUs),
        argv: Array.isArray(argv) ? argv.map(String) : [],
        addr: String(addr),
        client: String(name)
      }
    })
    return [{ ts: Date.now(), metric: "slowlog_get", values }]
  },

  // just a numeric count for the dashboard tile which displays a single number of slowlog
  slowlog_len: async () => {
    const n = await client.sendCommand(["SLOWLOG", "LEN"])
    return [{ ts: Date.now(), metric: "slowlog_len", value: Number(n) }]
  },
})
