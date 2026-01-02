import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { mergeDeepLeft } from "ramda"
import YAML from "yaml"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
let config = null
const loadConfig = () => {
  const cfgPath = process.env.CONFIG_PATH || path.join(__dirname, "..", "config.yml")
  const text = fs.readFileSync(cfgPath, "utf8")
  const parsed = YAML.parse(text) || {}

  const cfg = {
    valkey: {},
    server: { port: 3000, data_dir: "/app/data" },
    collector: { batch_ms: 60000, batch_max: 500 },
    epics: [],
    ...parsed,
  }

  cfg.valkey = cfg.valkey && typeof cfg.valkey === "object" ? cfg.valkey : {}
  cfg.server = cfg.server && typeof cfg.server === "object" ? cfg.server : { port: 3000, data_dir: "/app/data" }
  cfg.collector = cfg.collector && typeof cfg.collector === "object" ? cfg.collector : { batch_ms: 60000, batch_max: 500 }
  cfg.epics = Array.isArray(cfg.epics) ? cfg.epics : []

  if (process.env.VALKEY_URL) cfg.valkey.url = process.env.VALKEY_URL
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
  const cfgPath = getConfigPath()
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

  const newConfig = mergeDeepLeft(partialConfig, getConfig())
  setConfig(newConfig)

  return {
    success: true,
    statusCode: 200,
    message: "",
    data: partialConfig,
  }
}

const validatePartialConfig = (partialConfig) => {
  if (partialConfig == null || typeof partialConfig !== "object") {
    return new Error("Config update must be an object")
  }

  if (
    partialConfig.pollingInterval !== undefined &&
    !isPositiveNumber(partialConfig.pollingInterval)
  ) {
    return new Error("pollingInterval must be a positive non-zero number")
  }

  if (partialConfig.monitoring !== undefined) {
    if (typeof partialConfig.monitoring !== "object") {
      return new Error("monitoring must be an object")
    }

    const { monitorEnabled, monitorDuration } = partialConfig.monitoring

    if (
      monitorEnabled !== undefined &&
      typeof monitorEnabled !== "boolean"
    ) {
      return new Error("monitorEnabled must be a boolean")
    }

    if (
      monitorDuration !== undefined &&
      !isPositiveNumber(monitorDuration)
    ) {
      return new Error("monitorDuration must be a positive non-zero number")
    }
  }

  return null
}

const isPositiveNumber = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value > 0

export { getConfig, updateConfig }

