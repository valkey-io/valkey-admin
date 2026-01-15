import { WebSocket, WebSocketServer } from "ws"
import {  GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { VALKEY } from "../../../common/src/constants.ts"
import { connectPending, resetConnection } from "./actions/connection.ts"
import { sendRequested } from "./actions/command.ts"
import { setData } from "./actions/stats.ts"
import { setClusterData } from "./actions/cluster.ts"
import {
  addKeyRequested,
  deleteKeyRequested,
  getKeysRequested,
  getKeyTypeRequested,
  updateKeyRequested
} from "./actions/keys.ts"
import { hotKeysRequested } from "./actions/hotkeys.ts"
import { commandLogsRequested } from "./actions/commandLogs.ts"
import { updateConfig, enableClusterSlotStats } from "./actions/config.ts"
import { cpuUsageRequested } from "./actions/cpuUsage.ts"
import { memoryUsageRequested } from "./actions/memoryUsage.ts"
import { Handler, ReduxAction, unknownHandler, type WsActionMessage } from "./actions/utils.ts"

interface MetricsServerMessage {
  type: string
  payload: {
    metricsHost: string
    metricsPort: number
    serverConnectionId: string
  }
}

const wss = new WebSocketServer({ port: 8080 })
const metricsServerURIs: Map<string, string> = new Map()

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
})

wss.on("listening", () => { // Add a listener for when the server starts listening
  console.log("Websocket server running on localhost:8080")
  if (process.send) { // Check if process.send is available (i.e., if forked)
    process.send({ type: "websocket-ready" }) // Send a ready message to the parent process
  }
})

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected.")
  const clients: Map<string, GlideClient | GlideClusterClient> = new Map()
  
  const handlers: Record<string, Handler> = {
    [VALKEY.CONNECTION.connectPending]: connectPending,
    [VALKEY.CONNECTION.resetConnection]: resetConnection,
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
    await handler({ ws, clients, connectionId: connectionId!, metricsServerURIs })(action as ReduxAction)
  })
  ws.on("error", (err) => {
    console.error("WebSocket error:", err)
  })
  ws.on("close", (code, reason) => {
    // Close all Valkey connections
    clients.forEach((client) => client.close())
    clients.clear()

    console.log("Client disconnected. Reason:", code, reason.toString())
  })
})
