import http from "node:http"
import { describe, it, expect, afterAll } from "vitest"
import { buildResource, startOtelExporter } from "./exporter.js"
import { makeInfoCache } from "./info-cache.js"

// Kept in its own file so that the receivers in exporter.test.js cannot change the count.
const countListeners = () => process.getActiveResourcesInfo().filter((name) => name === "TCPServerWrap").length

describe("otel exporter listening sockets", () => {
  let server
  const savedEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT

  afterAll(async () => {
    if (savedEndpoint === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = savedEndpoint
    if (server) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  })

  it("opens no listening socket when it starts and exports", async () => {
    let received = 0
    server = http.createServer((req, res) => {
      req.resume()
      req.on("end", () => {
        received += 1
        res.writeHead(200)
        res.end()
      })
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${server.address().port}`

    const baseline = countListeners()
    const cache = makeInfoCache()
    cache.setMemory({ memory: { used_memory: "100" }, keyspace: {} })
    const silent = { debug() {}, info() {}, warn() {}, error() {} }
    const otel = startOtelExporter({
      intervalMs: 60_000,
      resource: buildResource({ env: { VALKEY_HOST: "127.0.0.1", VALKEY_PORT: "6379" }, nodeId: "127-0-0-1-6379" }),
      cache,
      log: silent,
    })
    expect(countListeners()).toBe(baseline)

    await otel.forceFlush()
    expect(received).toBe(1)
    expect(countListeners()).toBe(baseline)

    await otel.shutdown()
    expect(countListeners()).toBe(baseline)
  })
})
