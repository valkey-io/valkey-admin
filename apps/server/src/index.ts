import { WebSocket, WebSocketServer } from "ws"
import express from "express"
import helmet from "helmet"
import path from "path"
import http from "http"
import {
  VALKEY,
  ORCHESTRATOR_RATE_LIMIT_MAX_ENV,
  resolveOrchestratorRateLimitMax
} from "valkey-common"
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
import { bigKeysRequested } from "./actions/bigkeys"
import { commandLogsRequested } from "./actions/commandLogs"
import { updateConfig, enableClusterSlotStats, abortConfigSessionsForSocket } from "./actions/config"
import { cpuUsageRequested } from "./actions/cpuUsage"
import { memoryUsageRequested } from "./actions/memoryUsage"
import { monitorRequested } from "./actions/monitorAction"
import { unsubscribeAll } from "./node-watchers"
import { Handler, ReduxAction, safeSend, unknownHandler, type WsActionMessage } from "./actions/utils"
import {
  createMetricsOrchestratorRouter,
  startPreconfiguredMetricsServers,
  initialConnectionDetails,
  cleanupOrchestratorResources,
  isKubernetes,
  preConfiguredConnection,
  getInitialClient,
  updateClusterNodeRegistry,
  resolveClusterRefreshTarget,
  setPreconfiguredClusterId
} from "./metrics-orchestrator"
import { isAllowedWebSocketOrigin } from "./websocket-origin"
import { allOwnerStates, getOwnerState } from "./owner"
import {
  connectedNodesFor,
  createSocketBinding,
  resolveAction,
  scheduleRelease,
  type SocketBinding
} from "./socket-binding"
import type { Request, Response } from "express"

interface AliveWebSocket extends WebSocket {
  isAlive: boolean
  binding: SocketBinding
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

/**
 * Dedicated limit for the collector control plane.
 *
 * `/orchestrator/*` gets its own bucket rather than sharing the UI limiter 
 * because the UI limit is per browser, while this one is effectively per server.
 *
 * Spawned collectors all call back to `SERVER_HOST` from the same host, so
 * express-rate-limit's per-address keying puts every collector (one per node
 * per connected Valkey identity) into a single loopback bucket. At a 10s ping interval that is 6 requests per
 * minute per node, so the UI's 100/min ceiling would begin throttling
 * legitimate collectors at around 16 nodes. Sizing this separately keeps the
 * two tunable independently.
 */
const orchestratorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: resolveOrchestratorRateLimitMax(process.env[ORCHESTRATOR_RATE_LIMIT_MAX_ENV]),
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
  if (req.path.startsWith("/orchestrator")) return orchestratorLimiter(req, res, next)
  return limiter(req, res, next)
})

// Content Security Policy via helmet
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
}))

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

// Upper bound on a single cluster's topology re-discovery. Without it, one hung
// CLUSTER SLOTS would leave the awaited refresh unsettled and stall the broadcast
// for every cluster, not just the unresponsive one.
const TOPOLOGY_REDISCOVERY_TIMEOUT_MS = 10_000

async function refreshAllClusterRegistries() {
  // Each owner identity has its own clients and topology, so refresh and
  // broadcast per owner. A socket receives a cluster's update only when it
  // bound one of that owner's connections to the cluster.
  await Promise.all(allOwnerStates().map(async (state) => {
    // Group live connections by cluster once; used both to pick a client to
    // re-discover each cluster's topology and to target the broadcast below.
    const connectionIdsByCluster = new Map<string, string[]>()
    for (const [connectionId, entry] of state.clients) {
      if (!entry.clusterId) continue
      const ids = connectionIdsByCluster.get(entry.clusterId) ?? []
      ids.push(connectionId)
      connectionIdsByCluster.set(entry.clusterId, ids)
    }

    // Re-discover each tracked cluster before broadcasting. User-connected clusters
    // use their own client + node metadata; a preconfigured cluster (K8s / headless
    // Web) has no entry in `clients`, so it falls back to the initial client so
    // scaled-in nodes are picked up without a UI session. Time-bounded so one hung
    // node can't stall the whole loop.
    await Promise.all(
      [...state.clusterNodesRegistry.entries()].map(async ([clusterId, clusterNodes]) => {
        const connectionId = connectionIdsByCluster.get(clusterId)?.[0]
        const userClient = connectionId ? state.clients.get(connectionId)?.client : undefined

        const target = await resolveClusterRefreshTarget(clusterId, clusterNodes, userClient, state.clusterNodesRegistry)
        if (!target) return

        await Promise.race([
          updateClusterNodeRegistry(target.client, target.nodeInfo, clusterId, state.clusterNodesRegistry),
          delay(TOPOLOGY_REDISCOVERY_TIMEOUT_MS).then(() =>
            console.warn(`Topology re-discovery for cluster ${clusterId} timed out; broadcasting last known nodes.`),
          ),
        ])
      }),
    )

    for (const [clusterId, clusterNodes] of state.clusterNodesRegistry) {
      const connectionIds = connectionIdsByCluster.get(clusterId)
      if (!connectionIds) continue

      const message = JSON.stringify({
        type: VALKEY.CLUSTER.updateClusterInfo,
        payload: { clusterId, clusterNodes },
      })

      for (const ws of wss.clients) {
        const { binding } = ws as AliveWebSocket
        if (!connectionIds.some((id) => binding?.connections.get(id) === state.ownerKey)) continue
        safeSend(ws, message)
      }
    }
  }))
}

async function refreshAllClusterRegistriesLoop() {
  while (true) {
    try {
      await refreshAllClusterRegistries()
    } catch (err) {
      console.warn("Unable to refresh cluster topologies. ", err)
    } finally {
      const configured = Number(process.env.TOPOLOGY_REFRESH_INTERVAL)
      await delay(Number.isFinite(configured) && configured > 0 ? configured : 30000)
    }
  }
}

async function updateRegistryforK8() {
  const client = await getInitialClient()
  const clusterId = await updateClusterNodeRegistry(client, initialConnectionDetails)
  setPreconfiguredClusterId(clusterId)
}

// Default to loopback so an unauthenticated Web server isn't reachable off-host;
// containers (Docker/K8s) set SERVER_BIND_HOST=0.0.0.0 explicitly.
const bindHost =
  process.env.SERVER_BIND_HOST ?? (isKubernetes ? "0.0.0.0" : "127.0.0.1")
server.listen(port, bindHost, () => {
  console.log(`Server running at http://${bindHost}:${port}`)
  if (process.send) { // Check if process.send is available (i.e., if forked)
    process.send({ type: "websocket-ready" }) // Send a ready message to the parent process
  }
  refreshAllClusterRegistriesLoop()

  if (preConfiguredConnection) {
    startPreconfiguredMetricsServers()
  }
  if (isKubernetes) {
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
  // The Valkey connections this socket opened, each with the owner identity it
  // authenticated as. It also holds the per-owner cluster bookkeeping.
  ws.binding = createSocketBinding()

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
    [VALKEY.BIGKEYS.bigKeysRequested]: bigKeysRequested,
    [VALKEY.COMMANDLOGS.commandLogsRequested]: commandLogsRequested,
    [VALKEY.CONFIG.enableClusterSlotStats]: enableClusterSlotStats,
    [VALKEY.CPU.cpuUsageRequested]: cpuUsageRequested,
    [VALKEY.MEMORY.memoryUsageRequested]: memoryUsageRequested,
    [VALKEY.MONITOR.monitorRequested]: monitorRequested,
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

      // A socket may act only on connections it opened with credentials that
      // Valkey accepted. Connects resolve to the owner named by their details.
      const resolved = resolveAction(ws.binding, action)
      if (!resolved.ok) {
        console.warn(`Rejected ${action.type}: ${resolved.reason}`)
        return
      }
      const { ownerKey, state } = resolved

      await handler(
        { ws,
          clients: state.clients,
          connectionId: connectionId!,
          metricsServerMap: state.metricsServerMap,
          connectedNodesByCluster: connectedNodesFor(ws.binding, ownerKey),
          clusterNodesRegistry: state.clusterNodesRegistry,
          ownerKey,
          ownerState: state,
          binding: ws.binding })(action as ReduxAction)
    } catch (error) {
      console.error(`Error handling action ${action.type}:`, error)
    }
  })
  ws.on("error", (err) => {
    console.error("WebSocket error:", err)
  })
  ws.on("close", (code, reason) => {
    abortConfigSessionsForSocket(ws)
    unsubscribeAll(ws)
    console.log("Client disconnected. Reason:", code, reason.toString())

    // Release every connection this socket bound. Each one is torn down after
    // the teardown delay unless another socket of the same owner watches it.
    for (const [connectionId, ownerKey] of ws.binding.connections) {
      scheduleRelease(getOwnerState(ownerKey), connectionId)
    }
    ws.binding = createSocketBinding()
  })
})

function shutdown() {
  console.log("Shutdown signal received")
  clearInterval(interval)

  const forceExitTimeout = setTimeout(() => {
    console.error("Graceful shutdown timed out, forcing exit")
    process.exit(1)
  }, 10000)
  forceExitTimeout.unref()

  // Step 1: Stop accepting new connections (non-blocking, sets up drain callback)
  server.close(async () => {
    // Step 4: All connections drained — kill metrics servers and exit
    console.log("HTTP server closed")
    try {
      await cleanupOrchestratorResources()
    } catch (err) {
      console.error("Error during orchestrator resource cleanup", err)
    }
    process.exit(0)
  })

  // Step 2: Close all WebSocket clients (triggers drain so server.close callback can fire)
  wss.clients.forEach((ws) => {
    try {
      ws.close()
    } catch (err) {
      console.error("Error closing WebSocket client:", err)
    }
  })

  // Step 3: Close every owner's Valkey clients (releases connections on the Valkey side)
  for (const state of allOwnerStates()) {
    for (const [, { client }] of state.clients) {
      try {
        client.close()
      } catch (err) {
        console.error("Error closing Valkey client:", err)
      }
    }
  }
}
// Not sure if this will impact kubernetes use case
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
