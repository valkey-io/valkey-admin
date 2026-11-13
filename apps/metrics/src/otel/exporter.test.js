import { execFileSync } from "node:child_process"
import fs from "node:fs"
import http from "node:http"
import https from "node:https"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest"
import { AggregationTemporality, DataPointType, InMemoryMetricExporter } from "@opentelemetry/sdk-metrics"
import {
  buildResource,
  exportIntervalMs,
  isOtelEnabled,
  makeDiagLogger,
  maybeStartOtel,
  startOtelExporter
} from "./exporter.js"
import { makeInfoCache } from "./info-cache.js"
import { parseKeyspace } from "./metric-registry.js"

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__")
const toPairs = (raw) => raw
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes(":"))
  .map((line) => line.split(":", 2))
const fixtureMap = (name) => Object.fromEntries(toPairs(fs.readFileSync(path.join(fixturesDir, name), "utf8")))
const fixturePairs = (name) => toPairs(fs.readFileSync(path.join(fixturesDir, name), "utf8"))

const MEMORY = fixtureMap("info-memory.valkey-9.1-linux.txt")
const CPU_LINUX = fixtureMap("info-cpu.valkey-9.1-linux.txt")
const CPU_MACOS = fixtureMap("info-cpu.valkey-9.1-macos.txt")
const KEYSPACE = parseKeyspace(fixturePairs("info-keyspace.valkey-9.1-linux.txt"))

const OTEL_ENV_KEYS = [
  "METRICS_OTEL_ENABLED",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_EXPORTER_OTLP_TIMEOUT",
  "OTEL_EXPORTER_OTLP_CERTIFICATE",
  "OTEL_RESOURCE_ATTRIBUTES",
  "OTEL_SERVICE_NAME",
]

const cfgWith = (epics) => ({ epics })

const makeLog = () => {
  const lines = { debug: [], info: [], warn: [], error: [] }
  const log = Object.fromEntries(Object.keys(lines).map((level) => [level, (...args) => lines[level].push(args.map(String).join(" "))]))
  return { log, lines }
}

const filledCache = ({ memory = MEMORY, keyspace = KEYSPACE, cpu = CPU_LINUX } = {}) => {
  const cache = makeInfoCache()
  cache.setMemory({ memory, keyspace })
  cache.setCpu(cpu)
  return cache
}

const RESOURCE_ENV = { VALKEY_HOST: "10.0.0.1", VALKEY_PORT: "6379" }
const NODE_ID = "10-0-0-1-6379"

// One collect through InMemoryMetricExporter: returns { name -> metric data }.
const collectOnce = async ({ cache, exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE) }) => {
  const { log } = makeLog()
  const otel = startOtelExporter({
    intervalMs: 60_000,
    resource: buildResource({ env: RESOURCE_ENV, nodeId: NODE_ID }),
    cache,
    log,
    exporter,
  })
  await otel.forceFlush()
  await otel.shutdown()
  const last = exporter.getMetrics().at(-1)
  return {
    resource: last?.resource,
    metrics: Object.fromEntries((last?.scopeMetrics ?? []).flatMap((s) => s.metrics).map((m) => [m.descriptor.name, m])),
  }
}

// A receiver that records each request. `mode` decides the answer.
const startReceiver = async ({ mode = "ok", tls } = {}) => {
  const requests = []
  const handler = (req, res) => {
    const chunks = []
    req.on("data", (c) => chunks.push(c))
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, bytes: Buffer.concat(chunks).length })
      if (mode === "hang") return
      if (mode === "unauthorized") {
        res.writeHead(401)
        res.end("denied")
        return
      }
      res.writeHead(200, { "content-type": "application/x-protobuf" })
      res.end()
    })
  }
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler)
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  return {
    requests,
    url: `${tls ? "https" : "http"}://${tls ? "localhost" : "127.0.0.1"}:${port}`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
}

const waitFor = async (predicate, timeoutMs) => {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return predicate()
}

describe("otel exporter", () => {
  const savedEnv = {}
  const receivers = []
  const otels = []

  beforeAll(() => {
    OTEL_ENV_KEYS.forEach((key) => { savedEnv[key] = process.env[key] })
  })

  afterEach(async () => {
    await Promise.all(otels.splice(0).map((otel) => otel.shutdown()))
    await Promise.all(receivers.splice(0).map((receiver) => receiver.close()))
    OTEL_ENV_KEYS.forEach((key) => {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    })
  })

  const receiver = async (options) => {
    const r = await startReceiver(options)
    receivers.push(r)
    return r
  }

  describe("isOtelEnabled", () => {
    it("is on only for the literal string true", () => {
      expect(isOtelEnabled({ METRICS_OTEL_ENABLED: "true" })).toBe(true)
      for (const value of [undefined, "", "1", "TRUE", "True", "false", "yes"]) {
        expect(isOtelEnabled({ METRICS_OTEL_ENABLED: value })).toBe(false)
      }
    })
  })

  describe("exportIntervalMs", () => {
    it("uses the memory epic poll_ms", () => {
      expect(exportIntervalMs(cfgWith([{ name: "cpu", poll_ms: 3000 }, { name: "memory", poll_ms: 7000 }]))).toBe(7000)
    })

    it("falls back to the cpu epic poll_ms", () => {
      expect(exportIntervalMs(cfgWith([{ name: "cpu", poll_ms: 3000 }, { name: "monitor" }]))).toBe(3000)
    })

    it("is null when there is neither a memory nor a cpu epic", () => {
      expect(exportIntervalMs(cfgWith([{ name: "monitor" }, { name: "commandlog_slow", poll_ms: 10000 }]))).toBeNull()
      expect(exportIntervalMs(cfgWith([]))).toBeNull()
    })
  })

  describe("maybeStartOtel", () => {
    it("starts nothing and sends nothing when export is off", async () => {
      const r = await receiver()
      for (const value of [undefined, "1", "TRUE", "false"]) {
        const { log, lines } = makeLog()
        const env = { ...RESOURCE_ENV, METRICS_OTEL_ENABLED: value, OTEL_EXPORTER_OTLP_ENDPOINT: r.url }
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = r.url
        expect(maybeStartOtel({ cfg: cfgWith([{ name: "memory", poll_ms: 1000 }]), env, nodeId: NODE_ID, log })).toBeNull()
        expect(Object.values(lines).flat()).toEqual([])
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
      expect(r.requests).toHaveLength(0)
    }, 10_000)

    it("logs one warning and starts nothing when there is no memory or cpu epic", () => {
      const { log, lines } = makeLog()
      const env = { ...RESOURCE_ENV, METRICS_OTEL_ENABLED: "true" }
      expect(maybeStartOtel({ cfg: cfgWith([{ name: "monitor" }]), env, nodeId: NODE_ID, log })).toBeNull()
      expect(lines.warn).toHaveLength(1)
      expect(lines.error).toHaveLength(0)
    })

    it("returns onInfo and shutdown, and onInfo feeds the export", async () => {
      const r = await receiver()
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = r.url
      const { log } = makeLog()
      const env = { ...RESOURCE_ENV, METRICS_OTEL_ENABLED: "true" }
      const otel = maybeStartOtel({ cfg: cfgWith([{ name: "memory", poll_ms: 1000 }]), env, nodeId: NODE_ID, log })
      otels.push(otel)

      expect(typeof otel.onInfo).toBe("function")
      expect(typeof otel.shutdown).toBe("function")
      otel.onInfo("memory", { memory: MEMORY, keyspace: KEYSPACE })
      otel.onInfo("cpu", CPU_LINUX)

      expect(await waitFor(() => r.requests.length > 0, 5000)).toBe(true)
      expect(r.requests[0]).toMatchObject({ method: "POST", url: "/v1/metrics" })
      expect(r.requests[0].headers["content-type"]).toBe("application/x-protobuf")
    }, 10_000)
  })

  describe("mapping", () => {
    it("exports the design names, instrument types and units from a real Valkey 9.1 reply", async () => {
      const { metrics } = await collectOnce({ cache: filledCache() })

      const expectSum = (name, unit, monotonic) => {
        expect(metrics[name], name).toBeDefined()
        expect(metrics[name].dataPointType, name).toBe(DataPointType.SUM)
        expect(metrics[name].isMonotonic, name).toBe(monotonic)
        expect(metrics[name].descriptor.unit, name).toBe(unit)
      }
      const expectGauge = (name, unit) => {
        expect(metrics[name], name).toBeDefined()
        expect(metrics[name].dataPointType, name).toBe(DataPointType.GAUGE)
        expect(metrics[name].descriptor.unit, name).toBe(unit)
      }

      expectSum("valkey.memory.used", "By", false)
      expectSum("valkey.memory.max", "By", false)
      expectGauge("valkey.memory.used.peak", "By")
      expectGauge("valkey.memory.fragmentation_ratio", "1")
      expectSum("valkey.memory.lazyfree_pending_objects", "{object}", false)
      expectSum("valkey.db.keys", "{key}", false)
      expectSum("valkey.db.expires", "{key}", false)
      expectSum("valkey.cpu.time", "s", true)
      expectSum("valkey.cpu.main_thread.time", "s", true)
      expectSum("valkey.cpu.children.time", "s", true)

      // 20 memory + 2 keyspace + 3 CPU metrics on a Linux node with maxmemory set.
      expect(Object.keys(metrics)).toHaveLength(25)
      expect(metrics["valkey.memory.used"].dataPoints[0].value).toBe(Number(MEMORY.used_memory))
      expect(metrics["valkey.cpu.time"].dataPoints).toHaveLength(2)
    })

    it("only uses cpu.mode and valkey.db.index as data point attributes", async () => {
      const { metrics } = await collectOnce({ cache: filledCache() })
      const keys = new Set(Object.values(metrics).flatMap((m) => m.dataPoints.flatMap((p) => Object.keys(p.attributes))))
      expect(keys).toEqual(new Set(["cpu.mode", "valkey.db.index"]))
    })

    it("leaves out valkey.memory.max when maxmemory is 0", async () => {
      const { metrics } = await collectOnce({ cache: filledCache({ memory: { ...MEMORY, maxmemory: "0" } }) })
      expect(metrics["valkey.memory.max"]).toBeUndefined()
    })

    it("leaves out the main-thread CPU metric on macOS", async () => {
      const { metrics } = await collectOnce({ cache: filledCache({ cpu: CPU_MACOS }) })
      expect(metrics["valkey.cpu.main_thread.time"]).toBeUndefined()
      expect(metrics["valkey.cpu.time"].dataPoints).toHaveLength(2)
    })

    it("reports 0 keys for a database that leaves INFO KEYSPACE", async () => {
      const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE)
      const cache = filledCache()
      const { log } = makeLog()
      const otel = startOtelExporter({
        intervalMs: 60_000,
        resource: buildResource({ env: RESOURCE_ENV, nodeId: NODE_ID }),
        cache,
        log,
        exporter,
      })
      otels.push(otel)
      await otel.forceFlush()
      cache.setMemory({ memory: MEMORY, keyspace: { 0: { keys: 9, expires: 1 } } })
      await otel.forceFlush()

      const keys = exporter.getMetrics().at(-1).scopeMetrics[0].metrics.find((m) => m.descriptor.name === "valkey.db.keys")
      const byIndex = Object.fromEntries(keys.dataPoints.map((p) => [p.attributes["valkey.db.index"], p.value]))
      expect(byIndex).toEqual({ 0: 9, 3: 0 })
    })

    it("exports nothing and does not throw for a sparse INFO reply", async () => {
      const cache = makeInfoCache()
      cache.setMemory({ memory: { maxmemory_policy: "noeviction" }, keyspace: {} })
      cache.setCpu({})
      const { metrics } = await collectOnce({ cache })
      const values = Object.values(metrics).flatMap((m) => m.dataPoints.map((p) => p.value))
      expect(values.every(Number.isFinite)).toBe(true)
      expect(values).toEqual([])
    })

    it("exports nothing before the first fetch", async () => {
      const { metrics } = await collectOnce({ cache: makeInfoCache() })
      expect(metrics).toEqual({})
    })
  })

  describe("buildResource", () => {
    it("sets the node identity attributes", () => {
      const { attributes } = buildResource({ env: RESOURCE_ENV, nodeId: NODE_ID })
      expect(attributes).toMatchObject({
        "service.name": "valkey",
        "service.instance.id": NODE_ID,
        "db.system.name": "valkey",
        "server.address": "10.0.0.1",
        "server.port": 6379,
      })
      expect(attributes["service.namespace"]).toBeUndefined()
      expect(attributes["k8s.pod.name"]).toBeUndefined()
      expect(attributes["k8s.namespace.name"]).toBeUndefined()
    })

    it("adds OTEL_RESOURCE_ATTRIBUTES but keeps its own identity", () => {
      process.env.OTEL_RESOURCE_ATTRIBUTES = "service.namespace=ns,service.instance.id=evil,deployment.environment.name=stg"
      process.env.OTEL_SERVICE_NAME = "svc"
      const { attributes } = buildResource({ env: { ...RESOURCE_ENV, ...process.env }, nodeId: NODE_ID })
      expect(attributes["service.namespace"]).toBe("ns")
      expect(attributes["deployment.environment.name"]).toBe("stg")
      expect(attributes["service.instance.id"]).toBe(NODE_ID)
      expect(attributes["service.name"]).toBe("valkey")
    })

    it("adds the k8s attributes from POD_NAME and POD_NAMESPACE", () => {
      const { attributes } = buildResource({ env: { ...RESOURCE_ENV, POD_NAME: "valkey-0", POD_NAMESPACE: "data" }, nodeId: NODE_ID })
      expect(attributes["k8s.pod.name"]).toBe("valkey-0")
      expect(attributes["k8s.namespace.name"]).toBe("data")
    })

    it("is the resource of the exported data", async () => {
      const { resource } = await collectOnce({ cache: filledCache() })
      expect(resource.attributes["service.instance.id"]).toBe(NODE_ID)
    })
  })

  describe("OTLP transport", () => {
    const start = (cache = filledCache(), extra = {}) => {
      const { log, lines } = makeLog()
      const otel = startOtelExporter({
        intervalMs: 60_000,
        resource: buildResource({ env: RESOURCE_ENV, nodeId: NODE_ID }),
        cache,
        log,
        ...extra,
      })
      otels.push(otel)
      return { otel, lines }
    }

    it("posts protobuf to /v1/metrics with OTEL_EXPORTER_OTLP_HEADERS", async () => {
      const r = await receiver()
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = r.url
      process.env.OTEL_EXPORTER_OTLP_HEADERS = "x-token=abc"
      const { otel } = start()
      await otel.forceFlush()

      expect(r.requests).toHaveLength(1)
      expect(r.requests[0]).toMatchObject({ method: "POST", url: "/v1/metrics" })
      expect(r.requests[0].headers["content-type"]).toBe("application/x-protobuf")
      expect(r.requests[0].headers["x-token"]).toBe("abc")
      expect(r.requests[0].bytes).toBeGreaterThan(0)
    })

    it("uses OTEL_EXPORTER_OTLP_METRICS_ENDPOINT as given", async () => {
      const r = await receiver()
      process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT = `${r.url}/custom`
      const { otel } = start()
      await otel.forceFlush()
      expect(r.requests.map((q) => q.url)).toEqual(["/custom"])
    })

    it("honours OTEL_EXPORTER_OTLP_TIMEOUT", async () => {
      const r = await receiver({ mode: "hang" })
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = r.url
      process.env.OTEL_EXPORTER_OTLP_TIMEOUT = "200"
      const { otel } = start()
      const t0 = Date.now()
      await otel.forceFlush().catch(() => {})
      expect(Date.now() - t0).toBeLessThan(1000)
    })

    describe("TLS", () => {
      let tlsDir
      const hasOpenssl = (() => {
        try {
          execFileSync("openssl", ["version"], { stdio: "ignore" })
          return true
        } catch {
          return false
        }
      })()

      beforeAll(() => {
        if (!hasOpenssl) return
        tlsDir = fs.mkdtempSync(path.join(os.tmpdir(), "otel-tls-"))
        const run = (args) => execFileSync("openssl", args, { cwd: tlsDir, stdio: "ignore" })
        run(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.crt", "-days", "1", "-subj", "/CN=test-ca"])
        run(["req", "-newkey", "rsa:2048", "-nodes", "-keyout", "srv.key", "-out", "srv.csr", "-subj", "/CN=localhost"])
        fs.writeFileSync(path.join(tlsDir, "ext"), "subjectAltName=DNS:localhost")
        run(["x509", "-req", "-in", "srv.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "srv.crt", "-days", "1",
          "-extfile", "ext"])
      })

      afterAll(() => {
        if (tlsDir) fs.rmSync(tlsDir, { recursive: true, force: true })
      })

      const tlsOptions = () => ({ key: fs.readFileSync(path.join(tlsDir, "srv.key")), cert: fs.readFileSync(path.join(tlsDir, "srv.crt")) })

      it.skipIf(!hasOpenssl)("trusts a private CA from OTEL_EXPORTER_OTLP_CERTIFICATE", async () => {
        const r = await receiver({ tls: tlsOptions() })
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = r.url
        process.env.OTEL_EXPORTER_OTLP_CERTIFICATE = path.join(tlsDir, "ca.crt")
        const { otel } = start()
        await otel.forceFlush()
        expect(r.requests).toHaveLength(1)
      })

      it.skipIf(!hasOpenssl)("does not send to an untrusted certificate", async () => {
        const r = await receiver({ tls: tlsOptions() })
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT = r.url
        process.env.OTEL_EXPORTER_OTLP_TIMEOUT = "1000"
        const { otel } = start()
        await otel.forceFlush().catch(() => {})
        expect(r.requests).toHaveLength(0)
      })
    })

    it("keeps the cache working and logs one error when the endpoint refuses the export", async () => {
      const r = await receiver({ mode: "unauthorized" })
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = r.url
      process.env.OTEL_EXPORTER_OTLP_HEADERS = "authorization=Bearer SECRET123"
      const cache = filledCache()
      const { otel, lines } = start(cache)

      for (let i = 0; i < 3; i++) {
        await otel.forceFlush().catch(() => {})
        cache.setCpu({ ...CPU_LINUX, used_cpu_user: String(i) })
      }

      expect(r.requests).toHaveLength(3)
      expect(cache.cpu().used_cpu_user).toBe("2")
      expect(lines.error).toHaveLength(1)
      expect(Object.values(lines).flat().join("\n")).not.toContain("SECRET123")
    })

    it("shuts down within 2.5 s when the endpoint never answers, and a second shutdown is silent", async () => {
      const r = await receiver({ mode: "hang" })
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = r.url
      const { otel, lines } = start()
      await new Promise((resolve) => setTimeout(resolve, 100))

      const t0 = Date.now()
      await expect(otel.shutdown()).resolves.toBeUndefined()
      expect(Date.now() - t0).toBeLessThan(2500)

      const before = Object.values(lines).flat().length
      const t1 = Date.now()
      await expect(otel.shutdown()).resolves.toBeUndefined()
      expect(Date.now() - t1).toBeLessThan(50)
      expect(Object.values(lines).flat().length).toBe(before)
    }, 10_000)
  })

  describe("makeDiagLogger", () => {
    it("logs the first error, then one line per 60 s with the count of skipped errors", () => {
      const { log, lines } = makeLog()
      let now = 1_000_000
      const diag = makeDiagLogger(log, { now: () => now })

      diag.error("export failed 1")
      diag.error("export failed 2")
      diag.error("export failed 3")
      expect(lines.error).toHaveLength(1)
      expect(lines.error[0]).toContain("export failed 1")

      now += 60_000
      diag.error("export failed 4")
      expect(lines.error).toHaveLength(2)
      expect(lines.error[1]).toContain("export failed 4")
      expect(lines.error[1]).toContain("2")
    })

    it("maps verbose to debug", () => {
      const { log, lines } = makeLog()
      const diag = makeDiagLogger(log, { now: () => 0 })
      diag.verbose("details")
      expect(lines.debug).toEqual(["details"])
    })

    it("logs the message of an SDK export error, not the stack trace", () => {
      const { log, lines } = makeLog()
      const diag = makeDiagLogger(log, { now: () => 0 })
      // @opentelemetry/core loggingErrorHandler passes JSON.stringify of the flattened error.
      const error = new Error("PeriodicExportingMetricReader: metrics export failed (error OTLPExporterError: Unauthorized)")
      diag.error(JSON.stringify({ stack: error.stack, message: error.message, name: error.name }))
      diag.error(JSON.stringify({ stack: error.stack }))
      expect(lines.error).toEqual(["PeriodicExportingMetricReader: metrics export failed (error OTLPExporterError: Unauthorized)"])
    })
  })
})
