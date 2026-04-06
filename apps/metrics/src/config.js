import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { mergeDeepLeft } from "ramda"
import YAML from "yaml"

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
  cfg.epics = cfg.epics.map((e) => ({ ...EPIC_DEFAULTS, ...e }))

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

const setConfig = (newConfig) => {
  const tmpPath = `${cfgPath}.tmp`

  fs.writeFileSync(tmpPath, YAML.stringify(newConfig), "utf8")
  fs.renameSync(tmpPath, cfgPath)

  config = loadConfig()
}

const updateConfig = (partialConfig) => {
  const validationError = validatePartialConfig(partialConfig)

  if (validationError) {
    return {
      success: false,
      statusCode: 400,
      message: validationError.message,
      data: validationError,
    }
  }
  const cfg = getConfig()
  
  if (partialConfig.epic) {
    // TODO: use zod for validation
    const { name, ...fields } = partialConfig.epic
    const epicIndex = cfg.epics.findIndex((e) => e.name === name)
    if (epicIndex === -1) {
      return {
        success: false,
        statusCode: 400,
        message: `Unknown epic: ${name}`,
        data: {},
      }
    }
    const newConfig = structuredClone(cfg)
    newConfig.epics[epicIndex] = mergeDeepLeft(fields, newConfig.epics[epicIndex])
    setConfig(newConfig)
  } else {
    const newConfig = mergeDeepLeft(partialConfig, cfg)
    setConfig(newConfig)
  }

  return {
    success: true,
    statusCode: 200,
    message: "",
    data: partialConfig,
  }
}

const validatePartialConfig = (partialConfig) => {
  if (partialConfig == null || typeof partialConfig !== "object" || Array.isArray(partialConfig)) {
    return new Error("Config update must be an object")
  }

  if (partialConfig.epic !== undefined) {
    if (typeof partialConfig.epic !== "object" || Array.isArray(partialConfig.epic)) {
      return new Error("epic must be an object")
    }

    const { name, monitoringDuration, monitoringInterval, maxCommandsPerRun } = partialConfig.epic

    if (typeof name !== "string" || name.length === 0) {
      return new Error("epic.name must be a non-empty string")
    }

    if (
      monitoringDuration !== undefined &&
      !isPositiveNumber(monitoringDuration)
    ) {
      return new Error("monitoringDuration must be a positive non-zero number")
    }

    if (
      monitoringInterval !== undefined &&
      !isPositiveNumber(monitoringInterval)
    ) {
      return new Error("monitoringInterval must be a positive non-zero number")
    }

    if (
      maxCommandsPerRun !== undefined &&
      !isPositiveNumber(maxCommandsPerRun)
    ) {
      return new Error("maxCommandsPerRun must be a positive non-zero number")
    }
  }

  return null
}

const isPositiveNumber = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0

export { getConfig, updateConfig }

