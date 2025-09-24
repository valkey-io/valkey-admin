import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import YAML from "yaml"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const loadConfig = () => {
  const cfgPath = process.env.CONFIG_PATH || path.join(__dirname, "..", "config.yml")
  const text = fs.readFileSync(cfgPath, "utf8")
  const parsed = YAML.parse(text) || {}

  const cfg = {
    valkey: {},
    server: { port: 3000, data_dir: "/app/data" },
    collector: { batch_ms: 60000, batch_max: 500 },
    epics: [],
    ...parsed
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

export { loadConfig }
