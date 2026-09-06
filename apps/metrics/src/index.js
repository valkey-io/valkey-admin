import fs from "node:fs"
import express from "express"
import { ORCHESTRATOR_AUTH_KEY_ENV, buildUrl } from "valkey-common"
import { getConfig } from "./config.js"
import * as Streamer from "./effects/ndjson-streamer.js"
import { setupCollectors, stopCollectors } from "./init-collectors.js"
import { getCommandLogs } from "./handlers/commandlog-handler.js"
import { getDashboardInfo } from "./handlers/info-handler.js"
import { updateConfigHandler } from "./handlers/update-config-handler.js"
import { monitorHandler, useMonitor } from "./handlers/monitor-handler.js"
import { calculateHotKeysFromHotSlots } from "./analyzers/calculate-hot-keys.js"
import { enrichHotKeys } from "./analyzers/enrich-hot-keys.js"
import cpuFold from "./analyzers/calculate-cpu-usage.js"
import memoryFold from "./analyzers/memory-metrics.js"
import { bigKeysQuerySchema, cpuQuerySchema, memoryQuerySchema, parseQuery } from "./api-schema.js"
import { sanitizeUrl } from "./utils/helpers.js"
import { buildPingRequest, buildRegisterRequest, readOrchestratorKey } from "./utils/orchestrator-auth.js"
import { setupNdjsonCleaner, stopNdjsonCleaner } from "./effects/ndjson-cleaner.js"
import { createValkeyClient } from "./valkey-client.js"
import { GcpIAMProvider } from "./utils/gcp-iam-provider.js"
import { scanBigKeys } from "./analyzers/scan-big-keys.js"

async function main() {
  const cfg = getConfig()
  const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }) }
  ensureDir(cfg.server.data_dir)
  if (process.env.DEBUG_METRICS === "1") {
    console.log("Metrics config loaded:", JSON.stringify({
      data_dir: cfg.server.data_dir,
      epics: cfg.epics?.map(({ name, poll_ms }) => ({ name, poll_ms })),
    }))
  }

  const client = await createValkeyClient(cfg)
  const ownNodeId = sanitizeUrl(`${process.env.VALKEY_HOST}-${process.env.VALKEY_PORT}`)

  // GCP OAuth2 tokens expire ~1h; rotate the connection password before then so
  // reconnects keep authenticating. AWS IAM refreshes natively inside Glide.
  const gcpTokenRefresh = process.env.VALKEY_AUTH_TYPE === "gcp-iam"
    ? setInterval(async () => {
      try {
        await client.updateConnectionPassword(await new GcpIAMProvider().getCredentials(), true)
      } catch (err) {
        console.error("[gcp-iam] token refresh error:", err.message)
      }
    }, 45 * 60 * 1000)
    : undefined
  gcpTokenRefresh?.unref?.()

  await setupNdjsonCleaner(cfg)
  await setupCollectors(client, cfg)

  const app = express()
  app.use(express.json())

  // public API goes here:
  app.get("/health", (req, res) => res.json({ ok: true }))

  app.get("/memory", async (req, res) => {
    try {
      const { maxPoints, since, until } = parseQuery(memoryQuerySchema)(req.query)
      const series = await Streamer.memory(memoryFold({ maxPoints, since, until }))
      res.json(series)
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/cpu", async (req, res) => {
    try {
      const { maxPoints, tolerance, since, until } = parseQuery(cpuQuerySchema)(req.query)
      const series = await Streamer.cpu(cpuFold({ maxPoints, tolerance, since, until }))
      res.json(series)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/info", async (req, res) => {
    try {
      const data = await getDashboardInfo(client)
      res.json(data)
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/big-keys", async (req, res) => {
    try {
      // scanLimit, topN and batchSize are optional - scanBigKeys applies the defaults
      const result = await scanBigKeys(client, parseQuery(bigKeysQuerySchema)(req.query))
      res.json({ ...result, nodeId: ownNodeId })
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: e.message })
    }
  })

  app.get("/commandlog", (req, res) => getCommandLogs(req, res, ownNodeId))

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
      const hotKeys = await calculateHotKeysFromHotSlots(client, { count: Number(req.query.count) || 50 }).then(enrichHotKeys(client))
      return res.json({ hotKeys, nodeId: ownNodeId })
    }
    else useMonitor(res, client, ownNodeId, Number(req.query.count) || 50)
  })

  app.post("/update-config", (req, res) => updateConfigHandler(req, res))

  app.post("/connection/close", async (req, res) => {
    try {
      const { connectionId } = req.body
      if (connectionId !== ownNodeId) {
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
    const backendServerBase = `http://${backendServerHost}:${backendServerPort}`
    const registerURI = buildUrl(backendServerBase, "/orchestrator/register")
    const pingURI = buildUrl(backendServerBase, "/orchestrator/ping")
    const metricsServerUri = `http://${metricsAdvertiseHost}:${metricsAdvertisePort}`
    const orchestratorKey = readOrchestratorKey()
    let registerInFlight = null

    // Without key material every request would be rejected, so fail once
    // loudly. Spawned collectors receive this from the orchestrator; an
    // externally managed collector needs it provisioned.
    if (!orchestratorKey) {
      console.error(
        `Missing ${ORCHESTRATOR_AUTH_KEY_ENV}: cannot authenticate to the Valkey Admin server. Shutting down.`,
      )
      shutdown()
      return
    }

    const registerWithServer = async () => {
      if (registerInFlight) return registerInFlight

      registerInFlight = (async () => {
        try {
          const request = buildRegisterRequest({
            key: orchestratorKey,
            nodeId: ownNodeId,
            metricsServerUri,
          })
          if (!request) {
            console.error("Could not sign the register request.")
            return false
          }

          console.debug("Sending Register request to ", registerURI)
          const response = await fetch(registerURI, { method: "POST", ...request })

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

    const registerWithRetry = async () => {
      const maxAttempts = 30
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const success = await registerWithServer()
        if (success) return
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, 1000))
      }
      console.error("Failed to register with server after 30 attempts. Shutting down.")
      shutdown()
    }
    await registerWithRetry()
    // Base interval ±10% jitter
    const pingIntervalMs = cfg.backend.ping_interval * (1 + (Math.random() * 2 - 1) * 0.1)
    setInterval(async () => {
      try {
        const request = buildPingRequest({ key: orchestratorKey, nodeId: ownNodeId })
        if (!request) {
          console.error("Could not sign the ping request.")
          return
        }

        const response = await fetch(pingURI, { method: "POST", ...request })

        if (!response.ok) {
          const text = await response.text()
          console.debug("Ping failed:", response.status, text)
          // The orchestrator answers 401 for an unknown node as well as for a
          // bad credential, so a re-register is the recovery path for an entry
          // that has been swept away.
          if (response.status === 401) {
            await registerWithServer()
          }
        } else {
          console.debug(`Ping successful for node: ${ownNodeId}`)
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
      if (gcpTokenRefresh) clearInterval(gcpTokenRefresh)
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
