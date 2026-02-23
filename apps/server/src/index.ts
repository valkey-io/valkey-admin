import { WebSocket, WebSocketServer } from "ws"
import {  GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import express from "express"
import path from "path"
import http from "http"
import { VALKEY } from "valkey-common"
import { fileURLToPath } from "url"
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
import type { Request, Response } from "express"

interface MetricsServerMessage {
  type: string
  payload: {
    metricsHost: string
    metricsPort: number
    serverConnectionId: string
  }
}

const app = express()
const port = process.env.PORT || 8080
const server = http.createServer(app)
// --- Serve frontend static files ---

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendDist = path.join(__dirname, "../../frontend/dist")
app.use(express.static(frontendDist))

// Fallback to index.html for SPA routing
app.get("*", (_: Request, res: Response) => {
  res.sendFile(path.join(frontendDist, "index.html"))
})

const wss = new WebSocketServer({ server })
const metricsServerURIs: Map<string, string> = new Map()

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})

wss.on("listening", () => { // Add a listener for when the server starts listening
  console.log("Websocket server running on localhost:8080")
  if (process.send) { // Check if process.send is available (i.e., if forked)
    process.send({ type: "websocket-ready" }) // Send a ready message to the parent process
  }
})

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected.")
  const clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}> = new Map()
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
  process.on("message", (message: MetricsServerMessage ) => {
    if (message?.type === "metrics-started") {
      const metricsServerURI = `${message.payload.metricsHost}:${message.payload.metricsPort}`
      const { serverConnectionId } = message.payload
      metricsServerURIs.set(serverConnectionId, metricsServerURI)
      console.log(`Metrics server for ${serverConnectionId} saved with URI ${metricsServerURI}`)
    }
    if (message?.type === "metrics-closed"){
      if (metricsServerURIs.delete(message.payload.serverConnectionId)) {
        console.log(`Metrics server for ${message.payload.serverConnectionId} closed.`)
      }
    }
    if (message?.type === "system-suspended"){
      ws.send(
        JSON.stringify({
          type: "websocket/pauseRetries",
          payload: { pauseRetries: true },
        }),
      )
    }
    if (message?.type === "system-resumed"){
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
      connectionId = action!.payload.connectionId
    } catch (e) {
      console.log("Failed to parse the message", message.toString(), e)
    }

    const handler = handlers[action!.type] ?? unknownHandler
    await handler({ ws, clients, connectionId: connectionId!, metricsServerURIs, clusterNodesMap })(action as ReduxAction)
  })
  ws.on("error", (err) => {
    console.error("WebSocket error:", err)
  })
  ws.on("close", (code, reason) => {
    // Close all Valkey connections
    clients.forEach((connection) => connection.client.close())
    clients.clear()
    clusterNodesMap.clear()

    console.log("Client disconnected. Reason:", code, reason.toString())
  })
})
