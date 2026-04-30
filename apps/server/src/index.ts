import { WebSocket, WebSocketServer } from "ws"
import express from "express"
import path from "path"
import http from "http"
import { VALKEY, CONNECTION_TEARDOWN_DELAY_MS } from "valkey-common"
import { fileURLToPath } from "url"
import rateLimit from "express-rate-limit"
import { connectPending, resetConnection, closeConnection } from "./actions/connection"
import { topologyDiscoveryEndpointPending } from "./actions/topology"
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
import { monitorRequested, saveMonitorSettingsRequested } from "./actions/monitorAction"
import { unsubscribeAll, getWatcherCount } from "./node-watchers"
import { teardownConnection } from "./connection"
import { Handler, ReduxAction, unknownHandler, type WsActionMessage } from "./actions/utils"
import {
  createMetricsOrchestratorRouter,
  reconcileClusterMetricsServers,
  metricsServerMap,
  clusterNodesRegistry,
  initialConnectionDetails,
  cleanupOrchestratorResources,
  clients,
  isWebMode,
  isKubernetes,
  getInitialClient,
  updateClusterNodeRegistry
} from "./metrics-orchestrator"
import { isAllowedWebSocketOrigin } from "./websocket-origin"
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

const wss = new WebSocketServer({ noServer: true })

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms))

async function runReconcileLoop() {

  while (true) {
    try {
      await reconcileClusterMetricsServers(clusterNodesRegistry, metricsServerMap, initialConnectionDetails)
      await delay(10000)
    } catch (err) {
      console.error("Failed to reconcile metrics servers", err)
      await delay(10000)
    }
  }
}

async function refreshAllClusterRegistries() {
  await Promise.all(
    Object.entries(clusterNodesRegistry).map(async ([clusterId]) => {
      const clientEntry = [...clients.values()].find((e) => e.clusterId === clusterId)
      if (!clientEntry) return

      const updatedNodes = clusterNodesRegistry[clusterId]
      // Am I being too defensive here?
      if (!updatedNodes) return

      wss.clients.forEach((ws) => {
        ws.send(JSON.stringify({
          type: VALKEY.CLUSTER.updateClusterInfo,
          payload: { clusterId, clusterNodes: updatedNodes },
        }))
      })
    }),
  )
}

async function refreshAllClusterRegistriesLoop() {
  while (true) {
    try {
      await refreshAllClusterRegistries()
      const refreshInterval = process.env.TOPOLOGY_REFRESH_INTERVAL
      await delay( refreshInterval ? Number(refreshInterval) : 30000)
    } catch (err) {
      console.warn("Unable to refresh cluster topologies. ", err)
    }
  }
}

async function updateRegistryforK8() {
  const client = await getInitialClient()
  updateClusterNodeRegistry(client, initialConnectionDetails)
}

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
  if (process.send) { // Check if process.send is available (i.e., if forked)
    process.send({ type: "websocket-ready" }) // Send a ready message to the parent process
  }
  refreshAllClusterRegistriesLoop()

  if (isWebMode) {
    runReconcileLoop()
  }
  else if (isKubernetes) {
    updateRegistryforK8()
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

server.on("upgrade", (req, socket, head) => {
  if (!isAllowedWebSocketOrigin(req)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n")
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req)
  })
})

wss.on("connection", (ws: AliveWebSocket) => {
  console.log("Client connected.")
  ws.isAlive = true
  ws.on("pong", () => {ws.isAlive = true})
  // This is a simplified cluster node map that stores clusterIds and their corresponding nodeIds
  const connectedNodesByCluster: Map<string, string[]> = new Map()

  const handlers: Record<string, Handler> = {
    [VALKEY.CONNECTION.connectPending]: connectPending,
    [VALKEY.CONNECTION.resetConnection]: resetConnection,
    [VALKEY.CONNECTION.closeConnection]: closeConnection,
    [VALKEY.TOPOLOGY.discoveryEndpointPending]: topologyDiscoveryEndpointPending,
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
    [VALKEY.MONITOR.monitorRequested]: monitorRequested,
    [VALKEY.MONITOR.saveMonitorSettingsRequested]: saveMonitorSettingsRequested,
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
    ws.isAlive = true // Reset heartbeat on any incoming message
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
      await handler(
        { ws, 
          clients, 
          connectionId: connectionId!, 
          metricsServerMap, 
          connectedNodesByCluster, 
          clusterNodesRegistry })(action as ReduxAction)
    } catch (error) {
      console.error(`Error handling action ${action.type}:`, error)
    }
  })
  ws.on("error", (err) => {
    console.error("WebSocket error:", err)
  })
  ws.on("close", (code, reason) => {
    const removedIds = unsubscribeAll(ws)
    connectedNodesByCluster.clear()
    console.log("Client disconnected. Reason:", code, reason.toString())

    for (const connectionId of removedIds) {
      setTimeout(() => {
        if (getWatcherCount(connectionId) === 0) {
          teardownConnection(
            { clients, clusterNodesRegistry, metricsServerMap },
            connectionId,
          )
        }
      }, CONNECTION_TEARDOWN_DELAY_MS)
    }

    // Clean up any side-entries (e.g., node entries from config endpoint connections)
    for (const [id] of clients) {
      if (getWatcherCount(id) === 0) {
        teardownConnection(
          { clients, clusterNodesRegistry, metricsServerMap },
          id,
        )
      }
    }
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
// Not sure if this will impact kubernetes use case
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
