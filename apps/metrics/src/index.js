import fs from "node:fs"
import express from "express"
import { createClient } from "@valkey/client"
import { loadConfig } from "./config.js"
import * as Streamer from "./effects/ndjson-streamer.js"
import { setupCollectors, startMonitor, stopMonitor } from "./init-collectors.js"
import { calculateHotKeys } from "./analyzers/calculateHotKeys.js"
import { MODE, ACTION, MONITOR } from "./utils/constants.js"

async function main() {
  const cfg = loadConfig()
  const ensureDir = dir => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }
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
  client.on("error", err => console.error("valkey error", err))
  await client.connect()
  const stoppers = await setupCollectors(client, cfg)

  const app = express()

  // public API goes here:
  app.get("/health", (_req, res) => res.json({ ok: true }))

  app.get('/memory', async (_req, res) => {
    try {
      const rows = await Streamer.memory_stats()
      res.json({ rows })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get('/cpu', async (_req, res) => {
    try {
      const rows = await Streamer.info_cpu()
      res.json({ rows })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get('/slowlog', async (req, res) => {
    try {
      const count = Number(req.query.count) || 50
      const rows = await Streamer.slowlog_get(count)
      res.json({ count: Math.max(1, Math.min(500, count)), rows })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get('/slowlog_len', async (_req, res) => {
    try {
      const rows = await Streamer.slowlog_len()
      res.json({ rows })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  const monitorConfig = cfg.epics.find(e => e.name === MONITOR)
  const monitorDuration = monitorConfig.monitoringDuration
  let monitorRunning = false
  let checkAt

  const monitorHandler = async action => {
    try {
      switch (action) {
        case ACTION.START:
          if (monitorRunning) {
            return { monitorRunning }
          }
          await startMonitor(cfg)
          monitorRunning = true
          checkAt = Date.now() + monitorDuration
          return { monitorRunning, checkAt}

        case ACTION.STOP:
          if (!monitorRunning) {
            checkAt = null
            return { monitorRunning, checkAt }
          }
          await stopMonitor()
          monitorRunning = false
          checkAt = null
          return { monitorRunning, checkAt }

        case ACTION.STATUS:
          return { monitorRunning }

        default:
          return { error: 'Invalid action. Use ?action=start|stop|status' }
      }
    } catch (e) {
      console.error(`[monitor] ${action} error:`, e)
      return { error: e.message }
    }
  }
  app.get('/monitor', async (req, res) => {
    const result = await monitorHandler(req.query.action)
    checkAt = result.checkAt
    return res.json(result)
  })

  app.get('/hot-keys', async (req, res) => {
    let monitorResponse = {}
    try {
      if (!monitorRunning) {
        monitorResponse = await monitorHandler(ACTION.START)
        return res.json(monitorResponse)
      }
      if (Date.now() > checkAt) {
        const hotKeys = await calculateHotKeys()
        if (req.query.mode !== MODE.CONTINUOUS) {
          await monitorHandler(ACTION.STOP) 
        }
        monitorResponse = await monitorHandler(ACTION.STATUS)
        return res.json({ nodeId: url, hotKeys, ...monitorResponse })

      }
      return res.json({ checkAt })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // Setting port to 0 means Express will dynamically find a port
  const port = Number(cfg.server.port || 0)
  const server = app.listen(port, () => {
    const assignedPort = server.address().port
    console.log(`listening on http://0.0.0.0:${assignedPort}`)
    process.send?.({ type: 'metrics-started', payload: { valkeyUrl: url, metricsHost: 'http://0.0.0.0', metricsPort: assignedPort } });
  })

  const shutdown = async () => {
    console.log("shutting down")
    try {
      Object.values(stoppers).forEach(s => s && s())
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
