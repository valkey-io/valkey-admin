import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { mergeDeepLeft } from "ramda"
import YAML from "yaml"
import { configUpdateSchema, findForbiddenKey, formatIssues } from "./config-schema.js"
import { EPIC_KINDS, EPIC_NAME_PATTERN } from "./utils/constants.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cfgPath = process.env.CONFIG_PATH || path.join(__dirname, "..", "config.yml")

let config = null

/**
 * Per-epic retention defaults, applied to any epic missing these fields.
 * @property {number} data_retention_mb   – max disk budget (MB) per epic. Oldest files evicted when exceeded.
 * @property {number} data_retention_days – files older than this (by birthtime) are deleted in the daily cleanup.
 */
const EPIC_DEFAULTS = { data_retention_mb: 10, data_retention_days: 30 }

const DEFAULTS = {
  backend: { ping_interval: 10000 },
  valkey: {},
  server: { port: 3000, data_dir: "/app/data" },
  collector: { batch_ms: 60000, batch_max: 500 },
  epics: [],
}

/**
 * An epic's `name` is its only identifier: it selects the fetcher and becomes
 * the prefix of the NDJSON files written under `data_dir`. Because it reaches
 * `path.join`, an unsafe name is a hard configuration error rather than
 * something to work around. A name that is merely unrecognised collects nothing (no fetcher matches), 
 * so it is dropped with a warning instead.
 */
const validEpics = (epics) => epics.filter((epic) => {
  const name = epic?.name
  if (typeof name !== "string" || !EPIC_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid epic name in ${cfgPath}: ${JSON.stringify(name)}. `
      + "Epic names may only contain lowercase letters, digits and underscores.",
    )
  }
  if (!EPIC_KINDS.includes(name)) {
    console.error(`[config] Ignoring unknown epic "${name}". Known epics: ${EPIC_KINDS.join(", ")}`)
    return false
  }
  return true
})

const loadConfig = () => {
  const text = fs.readFileSync(cfgPath, "utf8")
  const parsed = YAML.parse(text) || {}

  const cfg = mergeDeepLeft(parsed, DEFAULTS)

  // Type guards
  for (const key of ["backend", "valkey", "server", "collector"]) {
    if (typeof cfg[key] !== "object" || Array.isArray(cfg[key])) {
      cfg[key] = DEFAULTS[key]
    }
  }
  if (!Array.isArray(cfg.epics)) cfg.epics = []
  cfg.epics = validEpics(cfg.epics).map((e) => ({ ...EPIC_DEFAULTS, ...e }))

  if (process.env.PORT) cfg.server.port = Number(process.env.PORT)
  if (process.env.DATA_DIR) cfg.server.data_dir = process.env.DATA_DIR
  if (process.env.BATCH_MS) cfg.collector.batch_ms = Number(process.env.BATCH_MS)
  if (process.env.BATCH_MAX) cfg.collector.batch_max = Number(process.env.BATCH_MAX)

  if (cfg.logging && typeof cfg.logging === "object") {
    if (!process.env.LOG_LEVEL && cfg.logging.level) process.env.LOG_LEVEL = String(cfg.logging.level)
    if (!process.env.LOG_FORMAT && cfg.logging.format) process.env.LOG_FORMAT = String(cfg.logging.format)
  }

  if (cfg.debug_metrics !== undefined && process.env.DEBUG_METRICS === undefined) {
    process.env.DEBUG_METRICS = cfg.debug_metrics ? "1" : "0"
  }

  return cfg
}

const getConfig = () => config ? config : loadConfig()

/**
 * Locate an epic inside the parsed YAML document by name.
 */
const epicDocumentIndex = (doc, name) => {
  const items = doc.get("epics")?.items ?? []
  return items.findIndex((item) => (typeof item?.get === "function" ? item.get("name") : item?.name) === name)
}

/**
 * Write the patch back into the operator's config file, best effort.
 *
 * The file is patched as a YAML document rather than re-serialized from the
 * runtime config, so comments, key order and quoting survive and no
 * environment-resolved value (`data_dir`, `port`, `batch_*`) is ever written back.
 *
 * Returns whether the write succeeded. A failure is logged and reported, never
 * thrown: the update has already been applied in memory, and refusing the
 * request would make the endpoint unusable wherever the config file is mounted
 * read-only.
 */
const persistPatches = (patchesByEpic) => {
  try {
    const doc = YAML.parseDocument(fs.readFileSync(cfgPath, "utf8"))

    for (const [name, fields] of Object.entries(patchesByEpic)) {
      const epicIndex = epicDocumentIndex(doc, name)
      if (epicIndex === -1) continue // the name came from this file, so this is unreachable in practice
      for (const [field, value] of Object.entries(fields)) {
        doc.setIn(["epics", epicIndex, field], value)
      }
    }

    const tmpPath = `${cfgPath}.${process.pid}.tmp`
    fs.writeFileSync(tmpPath, doc.toString(), "utf8")
    fs.renameSync(tmpPath, cfgPath)
    return true
  } catch (error) {
    console.error(
      `[config] Could not persist the update to ${cfgPath}; it applies to this process only `
      + `and will be lost on restart: ${error.message}`,
    )
    return false
  }
}

const badRequestReply = (message) => ({ success: false, statusCode: 400, message, data: {} })

/**
 * Apply a validated set of per-epic patches.
 *
 * All-or-nothing: the payload is validated and every named epic resolved
 * against the loaded config before anything changes, so a request naming one
 * bad epic changes nothing at all.
 *
 * The patch is applied to the in-memory config first and then persisted to the
 * overrides file, so an unwritable data dir costs durability but never the
 * update itself — `persisted` reports which happened.
 *
 * Only the fields in the schema's allowlist are copied onto the existing
 * entry; identity (`name`) is never touched, so no API input can reach a
 * filesystem path.
 */
const updateConfig = (partialConfig) => {
  const forbiddenKey = findForbiddenKey(partialConfig)
  if (forbiddenKey) return badRequestReply(`Illegal key: ${forbiddenKey}`)

  const parsed = configUpdateSchema.safeParse(partialConfig)
  if (!parsed.success) return badRequestReply(formatIssues(parsed.error))

  const cfg = getConfig()
  const patches = Object.entries(parsed.data.epics)

  const unknownNames = patches
    .map(([name]) => name)
    .filter((name) => !cfg.epics.some((epic) => epic.name === name))
  if (unknownNames.length > 0) {
    return badRequestReply(`Unknown epics: ${unknownNames.join(", ")}`)
  }

  const newConfig = structuredClone(cfg)
  for (const [name, fields] of patches) {
    const epicIndex = newConfig.epics.findIndex((epic) => epic.name === name)
    newConfig.epics[epicIndex] = { ...newConfig.epics[epicIndex], ...fields }
  }
  config = newConfig

  return {
    success: true,
    statusCode: 200,
    message: "",
    data: parsed.data,
    persisted: persistPatches(parsed.data.epics),
  }
}

export { getConfig, updateConfig }

