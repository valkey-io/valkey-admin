// Runs the MCP server as a child process of the Valkey Admin server in Web mode.
// Gives it an internal websocket token, requires a token and targets when not bound
// to loopback, and proxies /mcp requests to it on localhost.
import { type ChildProcess, spawn } from "child_process"
import { randomBytes } from "crypto"
import http from "http"
import { fileURLToPath } from "url"
import { DEPLOYMENT_TYPE } from "valkey-common"
import { setInternalClientToken } from "./websocket-origin"
import type { Request, Response } from "express"

export const MCP_ENABLED_ENV = "VALKEY_ADMIN_MCP_ENABLED"
export const MCP_TOKEN_ENV = "VALKEY_ADMIN_MCP_TOKEN"
export const MCP_TARGETS_ENV = "VALKEY_ADMIN_MCP_TARGETS"
export const MCP_PATHS = ["/mcp", "/mcp/*"]

const MCP_HOST = "127.0.0.1"
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]"])
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

let mcpProcess: ChildProcess | undefined
let stopping = false

const mcpPort = () => Number(process.env.VALKEY_ADMIN_MCP_PORT) || 8081

const isMcpEnabled = () => process.env[MCP_ENABLED_ENV] === "true"

const adminUrl = (bindHost: string, port: number) => {
  const host = WILDCARD_HOSTS.has(bindHost) ? "127.0.0.1" : bindHost
  return `ws://${host.includes(":") && !host.startsWith("[") ? `[${host}]` : host}:${port}`
}

export const stopMcpServer = () => {
  stopping = true
  mcpProcess?.kill("SIGTERM")
  mcpProcess = undefined
}

export const startMcpServer = (bindHost: string, port: number) => {
  if (!isMcpEnabled()) return
  if (process.env.DEPLOYMENT_MODE === DEPLOYMENT_TYPE.ELECTRON) {
    console.warn(`${MCP_ENABLED_ENV} is ignored in the desktop app. The MCP server needs Web mode.`)
    return
  }
  const missing = [MCP_TOKEN_ENV, MCP_TARGETS_ENV].filter((name) => !process.env[name])
  if (!LOOPBACK_HOSTS.has(bindHost) && missing.length > 0) {
    console.error(
      `MCP server not started: the server listens on ${bindHost}, so ${missing.join(" and ")} must be set. `
        + `Generate a token with \`openssl rand -hex 32\` and list targets as ${MCP_TARGETS_ENV}=name=host:port.`,
    )
    return
  }

  const token = randomBytes(32).toString("hex")
  setInternalClientToken(token)

  const proc = spawn(process.execPath, [fileURLToPath(new URL("../../mcp/dist/index.js", import.meta.url))], {
    env: {
      ...process.env,
      VALKEY_ADMIN_URL: adminUrl(bindHost, port),
      VALKEY_ADMIN_WS_TOKEN: token,
      VALKEY_ADMIN_MCP_PORT: String(mcpPort()),
    },
    stdio: ["ignore", "inherit", "inherit"],
  })
  mcpProcess = proc

  proc.on("error", (err) => {
    console.error("Failed to start the MCP server:", err)
  })
  proc.on("exit", (code, signal) => {
    if (mcpProcess === proc) mcpProcess = undefined
    if (!stopping) console.warn(`MCP server exited with code ${code} and signal ${signal}`)
  })
  process.once("exit", stopMcpServer)
}

export const proxyMcpRequest = (req: Request, res: Response) => {
  if (!mcpProcess) {
    res.status(isMcpEnabled() ? 503 : 404).end()
    return
  }
  const upstream = http.request(
    { host: MCP_HOST, port: mcpPort(), method: req.method, path: req.originalUrl, headers: req.headers },
    (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers)
      reply.pipe(res)
    },
  )
  upstream.on("error", () => {
    if (!res.headersSent) res.status(502)
    res.end()
  })
  res.on("close", () => upstream.destroy())
  req.pipe(upstream)
}
