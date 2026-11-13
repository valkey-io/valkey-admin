// Entry point. Serves the MCP endpoint on a localhost-only HTTP server, at
// /mcp/<target> when targets are configured and at /mcp otherwise. Refuses
// requests whose Origin is not local, and registers the tools. Callers must send
// the bearer token when one is configured; otherwise the Host must be local.
import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node"
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server"
import { type AdminClient, createAdminClient } from "./admin-client"
import { bearerTokenValidation } from "./auth"
import {
  type ConnectionConfig,
  MCP_PATH,
  connectionForRequest,
  hasValkeyHeaders,
  isServedPath,
  loadConfig
} from "./config"
import { registerBigKeys } from "./tools/big-keys"
import { registerHotKeys } from "./tools/hot-keys"
import { registerServerInfo } from "./tools/server-info"

const HOSTNAME = "127.0.0.1"

// Loads the configuration, starts the HTTP server and closes everything on SIGINT or SIGTERM.
const main = () => {
  const config = loadConfig()
  const clients = new Map<string, AdminClient>()
  const onerror = (error: Error) => console.error(error.message)

  // Reuses one admin client per distinct connection, so calls for the same Valkey deployment share a WebSocket.
  const adminClientFor = (connection: ConnectionConfig) => {
    const key = createHash("sha256").update(JSON.stringify(connection)).digest("hex")
    let client = clients.get(key)
    if (!client) {
      client = createAdminClient(connection, config.admin)
      clients.set(key, client)
    }
    return client
  }

  // Builds an MCP server for each request, bound to the Valkey connection its target or headers name.
  const mcp = createMcpHandler(({ requestInfo }) => {
    const pathname = new URL(requestInfo?.url ?? MCP_PATH, "http://localhost").pathname
    const admin = adminClientFor(connectionForRequest(config, pathname, requestInfo?.headers))
    const server = new McpServer({ name: "valkey-admin", version: "0.1.0" })
    registerServerInfo(server, admin)
    registerBigKeys(server, admin)
    registerHotKeys(server, admin)
    return server
  }, { onerror })
  const handle = toNodeHandler(mcp, { onerror })
  const validateCaller = config.token ? bearerTokenValidation(config.token) : localhostHostValidation()
  const validateOrigin = localhostOriginValidation()

  const httpServer = createServer((req, res) => {
    if (!validateCaller(req, res) || !validateOrigin(req, res)) return
    if (!isServedPath(config, new URL(req.url ?? "/", "http://localhost").pathname)) {
      res.writeHead(404, { "content-type": "text/plain" }).end("Unknown MCP target\n")
      return
    }
    if (config.targets && hasValkeyHeaders(Object.keys(req.headers))) {
      res.writeHead(400, { "content-type": "text/plain" })
        .end("X-Valkey-* headers are not accepted when VALKEY_ADMIN_MCP_TARGETS is set\n")
      return
    }
    void handle(req, res)
  })

  httpServer.listen(config.mcpPort, HOSTNAME, () => {
    const paths = config.targets ? [...config.targets.keys()].map((name) => `${MCP_PATH}/${name}`) : [MCP_PATH]
    console.log(`valkey-admin-mcp listening on http://localhost:${config.mcpPort} at ${paths.join(", ")}`)
  })

  const shutdown = () => {
    clients.forEach((client) => client.close())
    void mcp.close()
    httpServer.close()
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}

try {
  main()
} catch (error) {
  console.error(`valkey-admin-mcp: ${(error as Error).message}`)
  process.exit(1)
}
