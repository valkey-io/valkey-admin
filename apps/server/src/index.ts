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
import { detectIntent, llmHealth, getModel } from "./ai-intent"
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

app.use((req, res, next) => {
  if (req.path.startsWith("/orchestrator")) return next()
  return limiter(req, res, next)
})
app.use(express.static(frontendDist))
app.use(express.json())
const metricsRouter = createMetricsOrchestratorRouter()
app.use("/orchestrator", metricsRouter)

// ── AI Copilot Backend Endpoints (Breeth integration) ────────────────────────
const BREETH_API_URL = "https://api.thebreeth.com"
const BREETH_API_KEY = process.env.BREETH_API_KEY
const BREETH_GROUP_ID = "valkey-admin-copilot"

// Guard: every AI Copilot route requires the server-side Breeth API key.
function requireBreethKey(res: Response): boolean {
  if (!BREETH_API_KEY) {
    console.error("BREETH_API_KEY is not set. AI Copilot memory features are disabled.")
    res.status(500).json({
      ok: false,
      error: "Breeth integration is not configured. Set the BREETH_API_KEY environment variable on the server.",
    })
    return false
  }
  return true
}

async function breethPost(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`${BREETH_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${BREETH_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText })) as Record<string, string>
    throw new Error(err.message || err.error || `Breeth API ${response.status}`)
  }
  return response.json() as Promise<Record<string, unknown>>
}

// Save an analysis to Breeth
app.post("/api/ai-copilot/save-analysis", async (req: Request, res: Response) => {
  if (!requireBreethKey(res)) return
  try {
    const { timestamp, healthScore, rootCause, riskAssessment, issues, recommendations, optimizations, metricsSnapshot, query } = req.body

    const content = [
      `Valkey health analysis at ${timestamp}.`,
      `Health Score: ${healthScore}/100.`,
      `Root Cause: ${rootCause}`,
      `Risk: ${riskAssessment}`,
      issues?.length > 0 ? `Issues: ${issues.join(". ")}.` : "No issues detected.",
      `Recommendations: ${recommendations?.join(". ")}.`,
      `Optimizations: ${optimizations?.join(". ")}.`,
      metricsSnapshot ? `Memory: ${metricsSnapshot.used_memory ?? "unknown"} bytes. Clients: ${metricsSnapshot.connected_clients ?? "unknown"}. Hit ratio: ${metricsSnapshot.hitRatio ?? "unknown"}.` : "",
      query ? `User query: ${query}` : "",
    ].filter(Boolean).join(" ")

    const data = await breethPost("/v1/episodes", {
      content,
      group_id: BREETH_GROUP_ID,
      source_description: "valkey-admin-ai-copilot",
      extract_intent: true,
    })

    res.json({ ok: true, episode_name: data.episode_name, extracted: data.extracted })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save analysis"
    console.error("AI Copilot save-analysis error:", message)
    res.status(502).json({ ok: false, error: message })
  }
})

// Retrieve analysis history from Breeth
app.get("/api/ai-copilot/history", async (_req: Request, res: Response) => {
  if (!requireBreethKey(res)) return
  try {
    const data = await breethPost("/v1/search", {
      query: "Valkey health analysis score root cause recommendations",
      group_id: BREETH_GROUP_ID,
      limit: 10,
    })
    const edges = Array.isArray(data.edges) ? data.edges : []
    res.json({ ok: true, edges })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load history"
    console.error("AI Copilot history error:", message)
    res.status(502).json({ ok: false, edges: [], error: message })
  }
})

// Search for similar incidents
app.post("/api/ai-copilot/search-similar", async (req: Request, res: Response) => {
  if (!requireBreethKey(res)) return
  try {
    const { query, limit } = req.body
    if (!query) {
      res.status(400).json({ ok: false, edges: [], error: "query is required" })
      return
    }
    const data = await breethPost("/v1/search", {
      query,
      group_id: BREETH_GROUP_ID,
      limit: limit || 5,
    })
    const edges = Array.isArray(data.edges) ? data.edges : []
    res.json({ ok: true, edges })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to search"
    console.error("AI Copilot search-similar error:", message)
    res.status(502).json({ ok: false, edges: [], error: message })
  }
})

// Natural-language → intent → safe command ("Ask Valkey")
app.post("/api/ai-copilot/interpret", async (req: Request, res: Response) => {
  try {
    const { query } = req.body
    if (!query || typeof query !== "string") {
      res.status(400).json({ ok: false, error: "query is required" })
      return
    }
    const result = await detectIntent(query)
    console.log(
      `[AskValkey] query="${result.query}" → intent=${result.intent} ` +
      `confidence=${result.confidence} source=${result.source}` +
      (result.parseError ? ` parseError="${result.parseError}"` : ""),
    )
    res.json({ ok: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Intent detection failed"
    console.error("AI Copilot interpret error:", message)
    res.status(500).json({ ok: false, error: message })
  }
})

// LLM health check — confirms key presence and API reachability (never returns the key)
app.get("/api/ai-copilot/llm-health", async (_req: Request, res: Response) => {
  const health = await llmHealth()
  res.json(health)
})

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
  // AI Copilot startup health check (never logs the actual keys).
  console.log(`[AICopilot] BREETH_API_KEY ${process.env.BREETH_API_KEY ? "configured" : "MISSING"}`)
  console.log(`[AICopilot] GROQ_API_KEY ${process.env.GROQ_API_KEY ? "configured" : "MISSING"} (model: ${getModel()})`)
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
