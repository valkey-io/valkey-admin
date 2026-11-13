import { after, before, describe, it } from "node:test"
import assert from "node:assert"
import { type ChildProcess, spawn } from "node:child_process"
import { request } from "node:http"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"

const ENTRY = fileURLToPath(new URL("../index.ts", import.meta.url))
const TOKEN = "t".repeat(64)
const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
})

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })

const cleanEnv = () =>
  Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^VALKEY_/.test(name)))

const startMcp = (env: Record<string, string>) =>
  spawn(process.execPath, ["--import", "tsx", ENTRY], {
    env: { ...cleanEnv(), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  })

const waitForListening = (proc: ChildProcess) =>
  new Promise<void>((resolve, reject) => {
    let output = ""
    proc.stdout?.on("data", (data) => {
      output += data
      if (output.includes("listening")) resolve()
    })
    proc.stderr?.on("data", (data) => {
      output += data
    })
    proc.once("exit", (code) => reject(new Error(`MCP server exited with ${code}: ${output}`)))
  })

const waitForExit = (proc: ChildProcess) =>
  new Promise<{ code: number | null; stderr: string }>((resolve) => {
    let stderr = ""
    proc.stderr?.on("data", (data) => {
      stderr += data
    })
    proc.once("exit", (code) => resolve({ code, stderr }))
  })

const send = (port: number, path: string, headers: Record<string, string> = {}, body = INITIALIZE) =>
  new Promise<number>((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path,
      method: "POST",
      headers: {
        host: `localhost:${port}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
    }, (res) => {
      res.resume()
      resolve(res.statusCode ?? 0)
    })
    req.once("error", reject)
    req.end(body)
  })

describe("MCP HTTP server with a token and targets", () => {
  let proc: ChildProcess
  let port: number
  const auth = { authorization: `Bearer ${TOKEN}` }

  before(async () => {
    port = await freePort()
    proc = startMcp({
      VALKEY_ADMIN_MCP_PORT: String(port),
      VALKEY_ADMIN_MCP_TOKEN: TOKEN,
      VALKEY_ADMIN_MCP_TARGETS: "prod=127.0.0.1:6379",
    })
    await waitForListening(proc)
  })

  after(() => {
    proc.kill()
  })

  it("serves a listed target to a caller with the token", async () => {
    assert.strictEqual(await send(port, "/mcp/prod", auth), 200)
  })

  it("refuses a caller without the token", async () => {
    assert.strictEqual(await send(port, "/mcp/prod"), 401)
  })

  it("refuses a caller with a wrong token", async () => {
    assert.strictEqual(await send(port, "/mcp/prod", { authorization: `Bearer ${"x".repeat(64)}` }), 401)
  })

  it("refuses a foreign Origin", async () => {
    assert.strictEqual(await send(port, "/mcp/prod", { ...auth, origin: "https://evil.example" }), 403)
  })

  it("returns 404 for an unknown target and for /mcp", async () => {
    assert.strictEqual(await send(port, "/mcp/other", auth), 404)
    assert.strictEqual(await send(port, "/mcp", auth), 404)
  })

  it("refuses X-Valkey-* headers", async () => {
    assert.strictEqual(await send(port, "/mcp/prod", { ...auth, "x-valkey-host": "attacker.example" }), 400)
  })

  it("checks the token before revealing which targets exist", async () => {
    assert.strictEqual(await send(port, "/mcp/other"), 401)
  })
})

describe("MCP HTTP server in header mode", () => {
  let proc: ChildProcess
  let port: number

  before(async () => {
    port = await freePort()
    proc = startMcp({ VALKEY_ADMIN_MCP_PORT: String(port) })
    await waitForListening(proc)
  })

  after(() => {
    proc.kill()
  })

  it("serves /mcp to a local caller", async () => {
    assert.strictEqual(await send(port, "/mcp", { "x-valkey-port": "7001" }), 200)
  })

  it("refuses a non-local Host, as sent by a DNS rebinding page", async () => {
    assert.strictEqual(await send(port, "/mcp", { host: `evil.example:${port}` }), 403)
  })

  it("refuses a foreign Origin", async () => {
    assert.strictEqual(await send(port, "/mcp", { origin: "https://evil.example" }), 403)
  })

  it("returns 404 for /mcp/<name>", async () => {
    assert.strictEqual(await send(port, "/mcp/prod"), 404)
  })
})

describe("MCP HTTP server startup", () => {
  it("exits when the token is too short", async () => {
    const { code, stderr } = await waitForExit(startMcp({ VALKEY_ADMIN_MCP_TOKEN: "short" }))

    assert.strictEqual(code, 1)
    assert.match(stderr, /VALKEY_ADMIN_MCP_TOKEN/)
  })

  it("exits when a target entry is invalid", async () => {
    const { code, stderr } = await waitForExit(startMcp({ VALKEY_ADMIN_MCP_TARGETS: "prod=valkey://u:hunter2@h:1" }))

    assert.strictEqual(code, 1)
    assert.match(stderr, /Invalid VALKEY_ADMIN_MCP_TARGETS entry 1/)
    assert.doesNotMatch(stderr, /hunter2/)
  })
})
