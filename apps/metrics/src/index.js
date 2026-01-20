import fs from "node:fs"
import express from "express"
import { getConfig, updateConfig } from "./config.js"
import * as Streamer from "./effects/ndjson-streamer.js"
import { setupCollectors, stopCollectors } from "./init-collectors.js"
import { getCommandLogs } from "./handlers/commandlog-handler.js"
import { monitorHandler, useMonitor } from "./handlers/monitor-handler.js"
import { calculateHotKeysFromHotSlots } from "./analyzers/calculate-hot-keys.js"
import { enrichHotKeys } from "./analyzers/enrich-hot-keys.js"
import cpuFold from "./analyzers/calculate-cpu-usage.js"
import memoryFold from "./analyzers/memory-metrics.js"
import { cpuQuerySchema, memoryQuerySchema, parseQuery } from "./api-schema.js"
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GlideClient } = require("@valkey/valkey-glide")

async function main() {
  const cfg = getConfig()
  const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }
  ensureDir(cfg.server.data_dir)

  const addresses = [
    {
      host: process.env.VALKEY_HOST,
      port: Number(process.env.VALKEY_PORT),
    },
  ]
  const credentials =
    process.env.VALKEY_PASSWORD ? {
      username: process.env.VALKEY_USERNAME,
      password: process.env.VALKEY_PASSWORD,
    } : undefined

  const useTLS = process.env.VALKEY_TLS === "true"
  const client = await GlideClient.createClient({
    addresses,
    credentials,
    useTLS,
    ...(useTLS && process.env.VALKEY_VERIFY_CERT === "false" && {
      advancedConfiguration: {
        tlsAdvancedConfiguration: {
          insecure: true,
        },
      },
    }),

    requestTimeout: 5000,
    clientName: "test_client",
  })

  await setupCollectors(client, cfg)

  const app = express()
  app.use(express.json())

  // public API goes here:
  app.get("/health", (req, res) => res.json({ ok: true }))

  app.get("/memory", async (req, res) => {
    try {
      const { maxPoints, since, until } = parseQuery(memoryQuerySchema)(req.query)
      const series = await Streamer.memory_stats(memoryFold({ maxPoints, since, until }))
      res.json(series)
    } catch (e) {
      console.log(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/cpu", async (req, res) => {
    try {
      const { maxPoints, tolerance, since, until } = parseQuery(cpuQuerySchema)(req.query)
      const series = await Streamer.info_cpu(cpuFold({ maxPoints, tolerance, since, until }))
      res.json(series)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/commandlog", getCommandLogs)

  app.get("/slowlog_len", async (req, res) => {
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
    if (req.query.useHotSlots === "true") {
      const hotKeys = await calculateHotKeysFromHotSlots(client, req.query.count).then(enrichHotKeys(client))
      return res.json({ hotKeys })
    }
    else useMonitor(req, res, cfg, client)
  })

  app.post("/update-config", async (req, res) => {
    try {
      const result = updateConfig(req.body)
      return res.status(result.statusCode).json(result)
    }
    catch (error) {
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : String(error),
        data: error,
      })
    }
  })

  // Setting port to 0 means Express will dynamically find a port
  const port = Number(cfg.server.port || 0)
  const server = app.listen(port, () => {
    const assignedPort = server.address().port
    console.log(`listening on http://0.0.0.0:${assignedPort}`)
    process.send?.({ type: "metrics-started", payload: { metricsHost: "http://0.0.0.0", metricsPort: assignedPort } })
  })

  const shutdown = async () => {
    console.log("shutting down")
    try {
      await stopCollectors()
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
