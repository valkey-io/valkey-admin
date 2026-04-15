import fs from "node:fs"
import express from "express"
import { getConfig, updateConfig } from "./config.js"
import * as Streamer from "./effects/ndjson-streamer.js"
import { setupCollectors, stopCollectors } from "./init-collectors.js"
import { getCommandLogs } from "./handlers/commandlog-handler.js"
import { monitorHandler, readMonitorMetadata, useMonitor } from "./handlers/monitor-handler.js"
import { calculateHotKeysFromHotSlots } from "./analyzers/calculate-hot-keys.js"
import { enrichHotKeys } from "./analyzers/enrich-hot-keys.js"
import cpuFold from "./analyzers/calculate-cpu-usage.js"
import memoryFold from "./analyzers/memory-metrics.js"
import { cpuQuerySchema, memoryQuerySchema, parseQuery } from "./api-schema.js"
import { sanitizeUrl } from "./utils/helpers.js"
import { setupNdjsonCleaner, stopNdjsonCleaner } from "./effects/ndjson-cleaner.js"
import { createValkeyClient } from "./valkey-client.js"
import { ACTION, MONITOR } from "./utils/constants.js"

async function main() {
  const cfg = getConfig()
  const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }
  ensureDir(cfg.server.data_dir)
  if (process.env.DEBUG_METRICS === "1") {
    console.log("Metrics config loaded:", JSON.stringify({
      data_dir: cfg.server.data_dir,
      epics: cfg.epics?.map(({ name, type, file_prefix }) => ({ name, type, file_prefix })),
    }))
  }
  const client = await createValkeyClient(cfg)
  const ownConnectionId = sanitizeUrl(`${process.env.VALKEY_HOST}-${process.env.VALKEY_PORT}`)

  await setupNdjsonCleaner(cfg)
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
      console.error(e)
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

  app.get("/commandlog", (req, res) => getCommandLogs(req, res, ownConnectionId))

  app.get("/slowlog_len", async (req, res) => {
    try {
      const rows = await Streamer.slowlog_len()
      res.json({ rows })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/monitor", async (req, res) => {
    const result = await monitorHandler(req.query.action, getConfig())
    if (result.error) return res.status(500).json(result)
    return res.json(result)
  })

  app.get("/hot-keys", async (req, res) => {
    if (req.query.useHotSlots === "true") {
      const hotKeys = await calculateHotKeysFromHotSlots(client, req.query.count).then(enrichHotKeys(client))
      return res.json({ hotKeys })
    }
    else useMonitor(res, client)
  })

  app.post("/update-config", async (req, res) => {
    try {
      const result = updateConfig(req.body)

      if (result.success && result.data.epic?.name === MONITOR) {
        const { isRunning } = readMonitorMetadata()
        if (isRunning) {
          await monitorHandler(ACTION.STOP, getConfig())
          await monitorHandler(ACTION.START, getConfig())
        }
      }

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

  app.post("/connection/close", async (req, res) => {
    try {
      const { connectionId } = req.body
      if (connectionId !== ownConnectionId) {
        return res.status(400).json({
          ok: false,
          error: "Invalid connectionId",
        })
      }
      client.close()
      res.status(200).json({
        ok: true,
        connectionId,
      })
      setImmediate(shutdown)
    } catch (err) {
      return res.status(500).json({
        ok: false,
        err,
      })
    }
  })

  // Setting port to 0 means Express will dynamically find a port
  const port = Number(cfg.server.port || 0)
  const backendServerHost = process.env.SERVER_HOST || "localhost"
  const backendServerPort = process.env.SERVER_PORT || "8080"
  const metricsBindHost = process.env.METRICS_BIND_HOST ?? "0.0.0.0"
  const metricsAdvertiseHost = process.env.METRICS_ADVERTISE_HOST ?? process.env.METRICS_HOST ?? "127.0.0.1"
  const server = app.listen(port, metricsBindHost, async () => {
    const assignedPort = server.address().port
    const metricsAdvertisePort = Number(process.env.METRICS_ADVERTISE_PORT || assignedPort)
    const registerURI = `http://${backendServerHost}:${backendServerPort}/orchestrator/register`
    let registerInFlight = null

    const registerWithServer = async () => {
      if (registerInFlight) return registerInFlight

      registerInFlight = (async () => {
        try {
          console.debug("Sending Register request to ", registerURI)
          const response = await fetch(registerURI,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                metricsServerUri: `http://${metricsAdvertiseHost}:${metricsAdvertisePort}`,
                pid: process.pid,
                nodeId: ownConnectionId,
              }),
            },
          )

          const text = await response.text()

          if (!response.ok) {
            console.error("Register failed:", response.status, text)
            return false
          }

          console.log("Register success:", text)
          return true
        } catch (err) {
          console.error("Register request failed:", err)
          return false
        } finally {
          registerInFlight = null
        }
      })()

      return registerInFlight
    }

    console.debug(`listening on http://${metricsBindHost}:${assignedPort}`)
    await registerWithServer()
    // Base interval ±10% jitter
    const pingIntervalMs = cfg.backend.ping_interval * (1 + (Math.random() * 2 - 1) * 0.1)
    setInterval(async () => {
      try {
        const response = await fetch(`http://${backendServerHost}:${backendServerPort}/orchestrator/ping`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId: ownConnectionId }),
        })

        if (!response.ok) {
          const text = await response.text()
          console.debug("Ping failed:", response.status, text)
          if (response.status === 404) {
            await registerWithServer()
          }
        } else {
          console.debug(`Ping successful for node: ${ownConnectionId}`)
        }
      } catch (err) {
        console.debug("Ping request error:", err)
      }
    }, pingIntervalMs)
  })

  const shutdown = async () => {
    console.debug("shutting down")
    try {
      await stopNdjsonCleaner()
      await stopCollectors()
      if (client) {
        client.close()
      }
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
