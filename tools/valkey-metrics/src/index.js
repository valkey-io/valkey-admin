import fs from "fs"
import express from "express"
import { createClient } from "@valkey/client"
import { loadConfig } from "./config.js"
import * as Reader from "./effects/ndjson-reader.js"
import { setupCollectors } from "./init-collectors.js"

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
const stoppers = await setupCollectors(client)

const app = express()

// public API goes here:
app.get("/health", (req, res) => res.json({ ok: true }))

app.get('/memory', async (_req, res) => {
  try {
    const rows = await Reader.memory_stats()
    res.json({ rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/cpu', async (_req, res) => {
  try {
    const rows = await Reader.info_cpu()
    res.json({ rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/slowlog', async (req, res) => {
  try {
    const count = Number(req.query.count) || 50
    const rows = await Reader.slowlog_get(count)
    res.json({ count: Math.max(1, Math.min(500, count)), rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/slowlog_len', async (_req, res) => {
  try {
    const rows = await Reader.slowlog_len()
    res.json({ rows })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const port = Number(cfg.server.port || 3000)
const server = app.listen(port, () => {
  console.log(`listening on http://0.0.0.0:${port}`)
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
