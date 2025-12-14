import fs from "node:fs"
import express from "express"
import { createClient } from "@valkey/client"
import { loadConfig } from "./config.js"
import * as Streamer from "./effects/ndjson-streamer.js"
import { setupCollectors } from "./init-collectors.js"
import { getCommandLogs } from "./handlers/commandlog-handler.js"
import { monitorHandler, useMonitor } from "./handlers/monitor-handler.js"
import { calculateHotKeysFromHotSlots } from "./analyzers/calculate-hot-keys.js"
import { enrichHotKeys } from "./analyzers/enrich-hot-keys.js"

async function main() {
  const cfg = loadConfig()
  const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }
  ensureDir(cfg.server.data_dir)

  // Valkey single URL
  const url = String(process.env.VALKEY_URL || cfg.valkey.url || "").trim()
  if (!/^valkeys?:\/\//i.test(url)) {
    console.error(`VALKEY_URL must start with valkey:// or valkeys://, got: ${url || "(empty)"}`)
    process.exit(1)
  }

  // todo: this will collect metrics only from one node (from URL), so once connected, we need to
  //  run command `cluster nodes` and create clients for each node and run setupCollectors for each of them;
  //  and correspondingly, do something about it in the endpoints (group by probably?)
  const client = createClient({ url })
  client.on("error", (err) => console.error("valkey error", err))
  await client.connect()
  const stoppers = await setupCollectors(client, cfg)

  const app = express()

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
      const rows = await Streamer.info_cpu()
      // todo use meta for checkAt or lastUpdated
      // console.log("meta: ", getCollectorMeta("cpu"))
      res.json({ rows })
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
