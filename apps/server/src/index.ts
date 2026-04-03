import { WebSocket, WebSocketServer } from "ws"
import express from "express"
import path from "path"
import http from "http"
import { VALKEY } from "valkey-common"
import { fileURLToPath } from "url"
import rateLimit from "express-rate-limit"
import { connectPending, resetConnection, closeConnection } from "./actions/connection"
import { sendRequested } from "./actions/command"
import { setData } from "./actions/stats"
import { setClusterData } from "./actions/cluster"
import {
  addKeyRequested,
  deleteKeyRequested,
  getKeysRequested,
  getKeyTypeRequested,
  updateKeyRequested
} from "./actions/keys"
import { hotKeysRequested } from "./actions/hotkeys"
import { commandLogsRequested } from "./actions/commandLogs"
import { updateConfig, enableClusterSlotStats } from "./actions/config"
import { cpuUsageRequested } from "./actions/cpuUsage"
import { memoryUsageRequested } from "./actions/memoryUsage"
import { Handler, ReduxAction, unknownHandler, type WsActionMessage } from "./actions/utils"
import {
  createMetricsOrchestratorRouter,
  reconcileClusterMetricsServers,
  metricsServerMap,
  clusterNodesRegistry,
  initialConnectionDetails,
  cleanupOrchestratorResources,
  clients,
  getInitialClient
} from "./metrics-orchestrator"
import type { Request, Response } from "express"

interface AliveWebSocket extends WebSocket {
  isAlive: boolean
}

interface MetricsServerMessage {
  type: string
  payload: {
    metricsHost: string
    metricsPort: number
    serverConnectionId: string
    pid: number | undefined
  }
}

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,             // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
})
const app = express()
const port = Number(process.env.PORT) || 8080
const server = http.createServer(app)
// --- Serve frontend static files ---

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendDist = path.join(__dirname, "../../frontend/dist")

app.use(limiter)
app.use(express.static(frontendDist))
app.use(express.json())
const metricsRouter = createMetricsOrchestratorRouter()
app.use("/orchestrator", metricsRouter)

// Fallback to index.html for SPA routing
app.get("*", (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendDist, "index.html"))
})

const wss = new WebSocketServer({ server })

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms))

async function runReconcileLoop() {
  if (!initialConnectionDetails.host || !initialConnectionDetails.port) {
    console.error("USE_CLUSTER_ORCHESTRATOR is enabled but VALKEY_HOST and VALKEY_PORT are not set. Orchestrator will not start.")
    return
  }

  let initialClient
  let consecutiveFailures = 0
  const MAX_FAILURES = 5

  while (true) {
    try {
      if (!initialClient) {
        initialClient = await getInitialClient()
      }
      await reconcileClusterMetricsServers(clusterNodesRegistry, metricsServerMap, initialConnectionDetails, initialClient)
      consecutiveFailures = 0
      await delay(5000)
    } catch (err) {
      console.error("Failed to reconcile metrics servers", err)
      initialClient = undefined
      consecutiveFailures++
      if (consecutiveFailures >= MAX_FAILURES) {
        console.error(`Orchestrator failed ${MAX_FAILURES} consecutive times. Stopping reconcile loop.`)
        return
      }
      await delay(10000)
    }
  }
}

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
  if (process.send) { // Check if process.send is available (i.e., if forked)
    process.send({ type: "websocket-ready" }) // Send a ready message to the parent process
  }
  if (process.env.USE_CLUSTER_ORCHESTRATOR === "true") {
    runReconcileLoop()
  }
})

const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    const aliveSocket = ws as AliveWebSocket
    if (aliveSocket.isAlive === false) return ws.terminate()
    aliveSocket.isAlive = false
    ws.ping()
  })
}, 30000)
wss.on("connection", (ws: AliveWebSocket) => {
  console.log("Client connected.")
  ws.isAlive = true
  ws.on("pong", () => {ws.isAlive = true})
  // This is a simplified cluster node map that stores clusterIds and their corresponding nodeIds
  const clusterNodesMap: Map<string, string[]> = new Map()

  const handlers: Record<string, Handler> = {
    [VALKEY.CONNECTION.connectPending]: connectPending,
    [VALKEY.CONNECTION.resetConnection]: resetConnection,
    [VALKEY.CONNECTION.closeConnection]: closeConnection,
    [VALKEY.CONFIG.updateConfig]: updateConfig,
    [VALKEY.CLUSTER.setClusterData]: setClusterData,
    [VALKEY.COMMAND.sendRequested]: sendRequested,
    [VALKEY.STATS.setData]: setData,
    [VALKEY.KEYS.getKeysRequested]: getKeysRequested,
    [VALKEY.KEYS.getKeyTypeRequested]: getKeyTypeRequested,
    [VALKEY.KEYS.deleteKeyRequested]: deleteKeyRequested,
    [VALKEY.KEYS.addKeyRequested]: addKeyRequested,
    [VALKEY.KEYS.updateKeyRequested]: updateKeyRequested,
    [VALKEY.HOTKEYS.hotKeysRequested]: hotKeysRequested,
    [VALKEY.COMMANDLOGS.commandLogsRequested]: commandLogsRequested,
    [VALKEY.CONFIG.enableClusterSlotStats]: enableClusterSlotStats,
    [VALKEY.CPU.cpuUsageRequested]: cpuUsageRequested,
    [VALKEY.MEMORY.memoryUsageRequested]: memoryUsageRequested,
  }

  process.on("message", (message: MetricsServerMessage) => {
    if (message?.type === "system-suspended") {
      ws.send(
        JSON.stringify({
          type: "websocket/pauseRetries",
          payload: { pauseRetries: true },
        }),
      )
    }
    if (message?.type === "system-resumed") {
      ws.send(
        JSON.stringify({
          type: "websocket/resumeRetries",
          payload: { pauseRetries: false },
        }),
      )
    }
  })

  ws.on("message", async (message) => {
    let action: WsActionMessage | undefined
    let connectionId: string | undefined

    try {
      action = JSON.parse(message.toString())
      connectionId = action?.payload?.connectionId
    } catch (e) {
      console.error("Failed to parse the message", message.toString(), e)
      return
    }

    // validate action or type before processing
    if (!action || !action.type) {
      console.error("Invalid action received", action)
      return
    }

    try {
      const handler = handlers[action.type] ?? unknownHandler
      await handler({ ws, clients, connectionId: connectionId!, metricsServerMap, clusterNodesMap })(action as ReduxAction)
    } catch (error) {
      console.error(`Error handling action ${action.type}:`, error)
    }
  })
  ws.on("error", (err) => {
    console.error("WebSocket error:", err)
  })
  ws.on("close", (code, reason) => {
    clusterNodesMap.clear()
    console.log("Client disconnected. Reason:", code, reason.toString())
    // Close all Valkey connections
    clients.forEach((connection, connectionId) => {
      try {
        connection.client.close()
      } catch (error) {
        console.error(`Error closing connection ${connectionId}:`, error)
      }
    })
    clients.clear()
  })
})

function shutdown() {
  console.log("Shutdown signal received")
  clearInterval(interval)
  // Close websocket clients
  wss.clients.forEach((ws) => {
    try {
      ws.close()
    } catch (err) {
      console.error("Error closing WebSocket client", err)
    }
  })

  server.close(() => {
    console.log("HTTP server closed")
    try {
      cleanupOrchestratorResources()
    } catch (err) {
      console.error("Error during orchestrator resource cleanup", err)
    }
    process.exit(0)
  })
}
// Not sure if this will impact kubernetes usecase
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
