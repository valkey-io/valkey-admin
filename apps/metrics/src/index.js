import fs from "node:fs"
import express from "express"
import * as R from "ramda"
import { createClient } from "@valkey/client"
import { getConfig, updateConfig } from "./config.js"
import * as Streamer from "./effects/ndjson-streamer.js"
import { setupCollectors } from "./init-collectors.js"
import { getCommandLogs } from "./handlers/commandlog-handler.js"
import { monitorHandler, useMonitor } from "./handlers/monitor-handler.js"
import { calculateHotKeysFromHotSlots } from "./analyzers/calculate-hot-keys.js"
import { enrichHotKeys } from "./analyzers/enrich-hot-keys.js"
import cpuFold from "./analyzers/calculate-cpu-usage.js"

async function main() {
  const cfg = getConfig()
  const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }
  ensureDir(cfg.server.data_dir)

  // Valkey single URL
  const url = String(process.env.VALKEY_URL || cfg.valkey.url || "").trim()
  if (!/^valkeys?:\/\//i.test(url)) {
    console.error(`VALKEY_URL must start with valkey:// or valkeys://, got: ${url || "(empty)"}`)
    process.exit(1)
  }

  const client = createClient({ url })
  client.on("error", (err) => console.error("valkey error", err))
  await client.connect()
  const stoppers = await setupCollectors(client, cfg)

  const app = express()
  app.use(express.json())
  // public API goes here:
  app.get("/health", (_req, res) => res.json({ ok: true }))

  app.get("/memory", async (_req, res) => {
    try {
      const rows = await Streamer.memory_stats()
      res.json({ rows })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/cpu", async (_req, res) => {
    try {
      const tolerance = R.pipe(
        R.pathOr("0.025", ["query", "tolerance"]),
        Number,
        R.when( // when not a number or more than 20% — default to 2.5% tolerance interval
          R.either(Number.isNaN, R.lte(0.2)),
          R.always(0.025),
        ),
        Math.abs, // no negative numbers
      )(_req)

      const series = await Streamer.info_cpu(cpuFold({ tolerance }))
      res.json(series)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/commandlog", getCommandLogs)

  app.get("/slowlog_len", async (_req, res) => {
    try {
      const rows = await Streamer.slowlog_len()
      res.json({ rows })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/monitor", async (req, res) => {
    const result = await monitorHandler(req.query.action)
    return res.json(result)
  })

  app.get("/hot-keys", async (req, res) => {
    if (req.query.useHotSlots === "true"){
      const hotKeys = await calculateHotKeysFromHotSlots(client, req.query.count).then(enrichHotKeys(client))
      return res.json({ hotKeys })
    } 
    else useMonitor(req, res, cfg, client)
  })

  app.post("/update-config", async(req, res) => {
    try {
      const result = updateConfig(req.body)
      return res.status(result.statusCode).json(result)
    }
    catch (error) {
      return res.status(500).json( {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        data: error }) 
    }
  })

  // Setting port to 0 means Express will dynamically find a port
  const port = Number(cfg.server.port || 0)
  const server = app.listen(port, () => {
    const assignedPort = server.address().port
    console.log(`listening on http://0.0.0.0:${assignedPort}`)
    process.send?.({ type: "metrics-started", payload: { valkeyUrl: url, metricsHost: "http://0.0.0.0", metricsPort: assignedPort } })
  })

  const shutdown = async () => {
    console.log("shutting down")
    try {
      Object.values(stoppers).forEach((s) => s && s())
      server.close(() => process.exit(0))
    } catch (e) {
      console.error("shutdown error", e)
      process.exit(1)
    }
  }

  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}
main()
