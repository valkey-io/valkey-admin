function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Bulk write batch size: keys per parallel batch in `writeBulkKeys`. */
export const BATCH_SIZE = 1000

/** Default number of logical databases to populate per run. */
export const DEFAULT_DB_COUNT = 16

/** Default bulk string key count per database. */
export const DEFAULT_BULK_KEYS = 100000

/**
 * Minimum Valkey version that supports multiple logical databases when
 * cluster mode is enabled.
 */
export const MULTI_DB_BASELINE = "9.0.0"

/**
 * @typedef {Object} PopulateConfig
 * @property {number} dbCount Number of logical databases to populate.
 *   Default `16`. Validated as a positive integer.
 * @property {number} bulkKeys Bulk string keys per database.
 *   Default `100000`. Validated as a non-negative integer.
 */

/**
 * Strictly parse an integer-shaped env-var string.
 *
 * Behaviour:
 * - `undefined` and the empty string return `defaultValue` (treated as unset).
 * - Otherwise the input MUST match `/^\d+$/` (no signs, no whitespace, no
 *   decimals, no scientific notation, no mixed alphanumerics).
 * - The matched string is parsed with `Number.parseInt(raw, 10)` and the
 *   result MUST be a finite integer `>= min`.
 * - Any rejection throws an `Error` whose message names `name` and embeds
 *   `JSON.stringify(raw)` so the offending raw value is preserved verbatim.
 *
 * The strict regex matters because `Number.parseInt("16abc", 10)` returns
 * `16`, which would silently accept malformed input.
 *
 * @param {string | undefined} raw Raw env-var value (or `undefined` if unset).
 * @param {string} name Env-var name, used in error messages.
 * @param {{ defaultValue: number, min: number }} opts
 * @returns {number}
 */
export function parseStrictInt(raw, name, { defaultValue, min }) {
  if (raw === undefined || raw === "") {
    return defaultValue
  }
  const reject = () => {
    throw new Error(
      `${name} must be an integer >= ${min}, got ${JSON.stringify(raw)}`,
    )
  }
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    reject()
  }
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < min) {
    reject()
  }
  return parsed
}

/**
 * Read `POPULATE_DB_COUNT` and `POPULATE_BULK_KEYS` from `process.env` and
 * return a validated {@link PopulateConfig}.
 *
 * @returns {PopulateConfig}
 */
export function parseEnv() {
  const dbCount = parseStrictInt(
    process.env.POPULATE_DB_COUNT,
    "POPULATE_DB_COUNT",
    { defaultValue: DEFAULT_DB_COUNT, min: 1 },
  )
  const bulkKeys = parseStrictInt(
    process.env.POPULATE_BULK_KEYS,
    "POPULATE_BULK_KEYS",
    { defaultValue: DEFAULT_BULK_KEYS, min: 0 },
  )
  return { dbCount, bulkKeys }
}

/**
 * Write the canonical typed `Sample_Dataset` (string, list, set, hash, sorted
 * set, geo, bitmap, stream) into the currently selected logical database.
 *
 * Every key embeds the `db<dbIndex>` tag so per-database key sets are
 * structurally disjoint and the database index is visible in the UI without
 * consulting the script source. String values for `string:*` and the helper
 * field/list/set/zset values likewise embed the tag.
 *
 * The seven non-stream writes run in parallel via `Promise.all`. The five
 * `XADD` calls run sequentially with a 50ms sleep between each so the auto-
 * generated stream entry IDs are strictly increasing across distinct
 * millisecond timestamps.
 *
 * @param {{
 *   set: (key: string, value: string) => Promise<unknown>,
 *   rPush: (key: string, value: string) => Promise<unknown>,
 *   sAdd: (key: string, value: string) => Promise<unknown>,
 *   hSet: (key: string, fields: Record<string, string>) => Promise<unknown>,
 *   zAdd: (key: string, members: { score: number, value: string }[]) => Promise<unknown>,
 *   geoAdd: (key: string, point: { member: string, longitude: number, latitude: number }) => Promise<unknown>,
 *   setBit: (key: string, offset: number, value: number) => Promise<unknown>,
 *   xAdd: (key: string, id: string, fields: Record<string, string>) => Promise<unknown>,
 * }} client A `@valkey/client` standalone or cluster client.
 * @param {number} dbIndex Target logical database index for the seed run.
 * @returns {Promise<void>}
 */
export async function writeSampleDataset(client, dbIndex) {
  console.log(`[db${dbIndex}] writing sample dataset`)

  const tag = `db${dbIndex}`
  const I = Array.from({ length: 5 }, (_, i) => i + 1)
  const geoPoints = [
    { member: "London",  longitude: -0.1278,  latitude:  51.5074 },
    { member: "Paris",   longitude:  2.3522,  latitude:  48.8566 },
    { member: "NewYork", longitude: -74.0060, latitude:  40.7128 },
    { member: "Tokyo",   longitude: 139.6917, latitude:  35.6895 },
    { member: "Sydney",  longitude: 151.2093, latitude: -33.8688 },
  ]

  await Promise.all([
    ...I.map(i => client.set(`string:${tag}:${i}`, `value_${tag}_${i}`)),
    ...I.map(i => client.rPush(`list:${tag}`, `item_${tag}_${i}`)),
    ...I.map(i => client.sAdd(`set:${tag}`, `member_${tag}_${i}`)),
    ...I.map(i => client.hSet(`hash:${tag}`, { [`field_${i}`]: `value_${tag}_${i}` })),
    ...I.map(i => client.zAdd(`zset:${tag}`, [{ score: i, value: `zmember_${tag}_${i}` }])),
    ...geoPoints.map(p => client.geoAdd(`geo:${tag}`, p)),
    ...I.map(i => client.setBit(`bitmap:${tag}`, i, 1)),
  ])

  for (let i = 1; i <= 5; i++) {
    await client.xAdd(`stream:${tag}`, "*", { sensor: `${1000 + i}`, value: `${20 + i}` })
    await sleep(50)
  }
}

/**
 * Write `totalKeys` bulk string keys (`bulk:db<dbIndex>:<i>`) into the
 * currently selected logical database in
 * parallel-within-batch / sequential-across-batch shape.
 *
 * Each batch fans out up to {@link BATCH_SIZE} `SET` calls in parallel via
 * `Promise.all`, then awaits the batch before moving on to the next.
 *
 * The loop bounds are inclusive `[1, totalKeys]`, so a `totalKeys` of `0`
 * executes the loop body zero times (no writes, no batch logs).
 *
 * Key shape: `bulk:db<dbIndex>:<i>`. Value shape: `value_db<dbIndex>_<i>`.
 *
 * @param {{ set: (key: string, value: string) => Promise<unknown> }} client
 *   A `@valkey/client` standalone or cluster client.
 * @param {number} dbIndex Target logical database index for the bulk load.
 * @param {number} totalKeys Number of bulk keys to write. Must be a
 *   non-negative integer; `0` is a no-op.
 * @returns {Promise<void>}
 */
export async function writeBulkKeys(client, dbIndex, totalKeys) {
  const tag = `db${dbIndex}`
  for (let start = 1; start <= totalKeys; start += BATCH_SIZE) {
    const batchEnd = Math.min(start + BATCH_SIZE - 1, totalKeys)
    const promises = []
    for (let i = start; i <= batchEnd; i++) {
      promises.push(client.set(`bulk:${tag}:${i}`, `value_${tag}_${i}`))
    }
    await Promise.all(promises)
    console.log(`[db${dbIndex}] bulk ${start} → ${batchEnd}`)
  }
}

async function flushCurrentDatabase(client) {
  if (Array.isArray(client.masters)) {
    await Promise.all(
      client.masters.map(async node => {
        const nodeClient = await client.nodeClient(node)
        await nodeClient.sendCommand(["FLUSHDB"])
      }),
    )
    return
  }
  await client.sendCommand(["FLUSHDB"])
}

/**
 * Orchestrate a full per-database seed: `FLUSHDB` → sample dataset → bulk load.
 *
 * `FLUSHDB` is issued at the start of every per-database iteration so the
 * populate run is idempotent across reruns. Without this, a second populate
 * run with a smaller `POPULATE_BULK_KEYS` would leave stale keys behind from
 * the previous run. `FLUSHDB` is per-database (it only flushes the currently
 * selected database in standalone, and is routed to all masters for the
 * currently selected database in cluster), so it does not touch other
 * databases mid-run.
 *
 * @param {{
 *   flushDb: () => Promise<unknown>,
 *   set: (key: string, value: string) => Promise<unknown>,
 *   rPush: (key: string, value: string) => Promise<unknown>,
 *   sAdd: (key: string, value: string) => Promise<unknown>,
 *   hSet: (key: string, fields: Record<string, string>) => Promise<unknown>,
 *   zAdd: (key: string, members: { score: number, value: string }[]) => Promise<unknown>,
 *   geoAdd: (key: string, point: { member: string, longitude: number, latitude: number }) => Promise<unknown>,
 *   setBit: (key: string, offset: number, value: number) => Promise<unknown>,
 *   xAdd: (key: string, id: string, fields: Record<string, string>) => Promise<unknown>,
 * }} client A `@valkey/client` standalone or cluster client.
 * @param {number} dbIndex Target logical database index for the seed run.
 * @param {{ bulkKeys: number }} opts
 * @returns {Promise<void>}
 */
export async function seedDatabase(client, dbIndex, { bulkKeys }) {
  console.log(`[db${dbIndex}] flushing database`)
  await flushCurrentDatabase(client)

  await writeSampleDataset(client, dbIndex)

  console.log(
    `[db${dbIndex}] writing ${bulkKeys} bulk keys in batches of ${BATCH_SIZE}`,
  )
  await writeBulkKeys(client, dbIndex, bulkKeys)
  console.log(`[db${dbIndex}] bulk load complete`)
}

/**
 * Switch a standalone client to the given logical database via `SELECT`.
 *
 * Trivial wrapper around `client.select(dbIndex)` for symmetry with the
 * cluster code path (which switches databases by reconnecting with
 * `defaults.database = dbIndex` rather than issuing `SELECT` mid-flight).
 *
 * @param {{ select: (db: number) => Promise<unknown> }} client
 *   A `@valkey/client` standalone client.
 * @param {number} dbIndex Target logical database index.
 * @returns {Promise<void>}
 */
export async function selectDatabase(client, dbIndex) {
  await client.select(dbIndex)
}

/**
 * Assert that the connected deployment is configured to support at least the
 * requested `Database_Count`.
 *
 * Issues `CONFIG GET cluster-databases` for cluster deployments or
 * `CONFIG GET databases` for standalone deployments, parses the reply with
 * {@link parseConfigGetValue}, and compares the configured value against
 * `requestedDbCount`. When the cluster-mode lookup yields `undefined` (older
 * configurations may report only `databases` even with cluster mode on), we
 * fall back to a `CONFIG GET databases` query before giving up.
 *
 * Throws an `Error` whose message names both `requestedDbCount` and the
 * configured count when the request overruns the deployment's configured
 * database count. The message also points the user at the appropriate
 * `--databases` / `--cluster-databases` flag for the remediation. Lowering
 * `POPULATE_DB_COUNT` below the configured count is allowed; only overruns
 * are rejected.
 *
 * @param {{ sendCommand: (args: string[]) => Promise<unknown> }} client
 *   A `@valkey/client` standalone or cluster client.
 * @param {number} requestedDbCount The Database_Count requested for the run.
 * @param {boolean} isCluster `true` if `client` is a cluster client.
 * @returns {Promise<void>}
 */
export async function assertConfiguredDatabases(client, requestedDbCount, isCluster) {
  const key = isCluster ? "cluster-databases" : "databases"
  const result = isCluster
    ? await client.sendCommand(undefined, false, ["CONFIG", "GET", key])
    : await client.sendCommand(["CONFIG", "GET", key])
  let configured = parseConfigGetValue(result, key)
  if (configured === undefined && isCluster) {
    // Older cluster configurations may report only "databases" even with
    // cluster mode on. Fall back before giving up.
    const fallback = await client.sendCommand(undefined, false, ["CONFIG", "GET", "databases"])
    configured = parseConfigGetValue(fallback, "databases")
  }
  if (configured === undefined) {
    throw new Error(
      `Could not read configured database count from CONFIG GET`,
    )
  }
  const configuredNumber = Number(configured)
  if (requestedDbCount > configuredNumber) {
    throw new Error(
      `POPULATE_DB_COUNT=${requestedDbCount} exceeds the deployment's configured database count of ${configured}. ` +
      `Either lower POPULATE_DB_COUNT or raise --${key} on the Valkey server.`,
    )
  }
}

/**
 * Probe `INFO server` on a cluster client and assert the reported Valkey
 * version is at least {@link MULTI_DB_BASELINE}.
 *
 * Issues `INFO server` via `cluster.sendCommand(["INFO", "server"])` and
 * parses the body for the version line. Both `redis_version` (Valkey reports
 * this for Redis-protocol compatibility) and `valkey_version` (defensive,
 * for future builds that may switch the field name) are accepted, in either
 * case. The reply is coerced via `String(...)` so non-string shapes from
 * exotic clients still flow through the regex.
 *
 * Throws an `Error` whose message names the parse failure when the regex
 * does not match. Throws an `Error` whose message names both the detected
 * `<x.y.z>` and the {@link MULTI_DB_BASELINE} when `major < 9`. On success,
 * emits `[probe] cluster version <x.y.z> satisfies >= 9.0.0` on stdout.
 *
 * @param {{ sendCommand: (args: string[]) => Promise<unknown> }} cluster
 *   A `@valkey/client` cluster client.
 * @returns {Promise<void>}
 */
export async function assertClusterVersion(cluster) {
  const info = await cluster.sendCommand(undefined, false, ["INFO", "server"])
  const body = typeof info === "string" ? info : String(info)
  const match =
    /\bvalkey_version:(\d+)\.(\d+)\.(\d+)/i.exec(body) ||
    /\bredis_version:(\d+)\.(\d+)\.(\d+)/i.exec(body)
  if (!match) {
    throw new Error(`Could not parse Valkey version from INFO server output`)
  }
  const major = match[1]
  const minor = match[2]
  const patch = match[3]
  const detected = `${major}.${minor}.${patch}`
  if (Number(major) < 9) {
    throw new Error(
      `Cluster Valkey version ${detected} does not meet the multi-database baseline of ${MULTI_DB_BASELINE}. ` +
      `Pin valkey/valkey:9.0 or newer in tools/valkey-cluster/docker-compose.yml.`,
    )
  }
  console.log(`[probe] cluster version ${detected} satisfies >= ${MULTI_DB_BASELINE}`)
}

/**
 * Wrap a per-database write error with the multi-database baseline note when
 * the underlying error looks like a `SELECT` rejection on `dbIndex > 0`.
 *
 * For all other inputs (`dbIndex === 0`, errors that do not match the
 * SELECT-rejection family) the original `err` is returned unchanged so the
 * top-level handler can log and exit on the original cause.
 *
 * @param {unknown} err Error caught from a per-database write.
 * @param {number} dbIndex Logical database index that failed.
 * @returns {unknown} A wrapped `Error` for SELECT-rejection on `dbIndex > 0`,
 *   otherwise `err` unchanged.
 */
export function wrapDbError(err, dbIndex) {
  const msg = String((err && err.message) || err)
  if (dbIndex > 0 && /(DB index is out of range|SELECT is not allowed)/i.test(msg)) {
    return new Error(
      `Failed writing to database ${dbIndex}: ${msg}. This typically means the cluster does not support multiple ` +
      `databases. Cluster multi-database support requires Valkey ${MULTI_DB_BASELINE} or newer.`,
    )
  }
  return err
}

/**
 * Parse a value for `key` out of a `CONFIG GET` reply.
 *
 * `@valkey/client` returns `CONFIG GET` historically as a flat
 * `[key, value, key, value, …]` array (Redis RESP-2 shape) and, in newer
 * versions, as an object map (`{ databases: "16" }`). Both shapes are
 * accepted here so callers do not need to care about the wire format.
 *
 * Behaviour:
 * - `null` / `undefined`: returns `undefined`.
 * - Even-length array: walks pairwise, returning `result[idx + 1]` where
 *   `result[idx] === key`. Returns `undefined` if the key is not present.
 * - Non-null object: returns `result[key]` directly, or `undefined` if the
 *   key is not present.
 *
 * The returned value is a string (Valkey's `CONFIG GET` reply is text).
 * Callers are responsible for `Number(...)` conversion when a numeric value
 * is expected.
 *
 * @param {unknown} result Reply from `CONFIG GET <key>`.
 * @param {string} key Configuration key to extract.
 * @returns {string | undefined}
 */
export function parseConfigGetValue(result, key) {
  if (result === null || result === undefined) {
    return undefined
  }
  if (Array.isArray(result)) {
    if (result.length % 2 !== 0) {
      return undefined
    }
    for (let idx = 0; idx < result.length; idx += 2) {
      if (result[idx] === key) {
        return result[idx + 1]
      }
    }
    return undefined
  }
  if (typeof result === "object") {
    return result[key]
  }
  return undefined
}
