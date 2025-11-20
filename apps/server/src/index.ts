import { WebSocket, WebSocketServer } from "ws"
import {  GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { VALKEY } from "../../../common/src/constants.ts"
import {
  getKeys,
  getKeyInfoSingle,
  deleteKey,
  addKey,
  updateKey
} from "./keys-browser.ts"
import { connectToValkey } from "./connection.ts"
import { setDashboardData, setClusterDashboardData } from "./setDashboardData.ts"
import { sendValkeyRunCommand } from "./sendCommand.ts"

const wss = new WebSocketServer({ port: 8080 })

wss.on("listening", () => { // Add a listener for when the server starts listening
  console.log("Websocket server running on localhost:8080")
  if (process.send) { // Check if process.send is available (i.e., if forked)
    process.send({ type: "websocket-ready" }) // Send a ready message to the parent process
  }
})

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected.")
  const clients: Map<string, GlideClient | GlideClusterClient> = new Map()

  ws.on("message", async (message) => {
    console.log("Received message:", message.toString())
    let action = undefined
    let connectionId = undefined
    try {
      action = JSON.parse(message.toString())
      connectionId = action.payload.connectionId
    } catch (e) {
      console.log("Failed to parse the message", message.toString(), e)
    }
    if (action.type === VALKEY.CONNECTION.connectPending) {
      await connectToValkey(ws, action.payload, clients)
    }
    if (action.type === VALKEY.COMMAND.sendRequested) {
      const client = clients.get(connectionId)
      if (client) {
        await sendValkeyRunCommand(client, ws, action.payload)
      } else {
        ws.send(
          JSON.stringify({
            type: VALKEY.COMMAND.sendFailed,
            payload: {
              error: "Invalid connection Id",
            },
          }),
        )
      }
    }
    if (action.type === VALKEY.STATS.setData) {
      const client = clients.get(connectionId)

      if (client instanceof GlideClient)
        await setDashboardData(connectionId, client, ws)

    }
    if (action.type === VALKEY.CLUSTER.setClusterData) {
      const client = clients.get(connectionId)
      if (client instanceof GlideClusterClient) {
        await setClusterDashboardData(action.payload.clusterId, client, ws)
      }

    }
    if (action.type === VALKEY.CONNECTION.resetConnection) {
      const client = clients.get(connectionId)

      if (client) {
        client.close()
        clients.delete(connectionId)
      }
    }
    if (action.type === VALKEY.KEYS.getKeysRequested) {
      const client = clients.get(connectionId)

      if (client) {
        await getKeys(client, ws, action.payload)
      } else {
        ws.send(
          JSON.stringify({
            type: VALKEY.KEYS.getKeysFailed,
            payload: {
              connectionId,
              error: "Invalid connection Id",
            },
          }),
        )
      }
    } if (action.type === VALKEY.KEYS.getKeyTypeRequested) {
      console.log("Handling getKeyTypeRequested for key:", action.payload?.key)
      const client = clients.get(connectionId)

      if (client) {
        await getKeyInfoSingle(client, ws, action.payload)
      } else {
        console.log("No client found for connectionId:", connectionId)
        ws.send(
          JSON.stringify({
            type: VALKEY.KEYS.getKeyTypeFailed,
            payload: {
              connectionId,
              key: action.payload?.key,
              error: "Invalid connection Id",
            },
          }),
        )
      }
    } if (action.type === VALKEY.KEYS.deleteKeyRequested) {
      console.log("Handling deleteKeyRequested for key:", action.payload?.key)
      const client = clients.get(connectionId)

      if (client) {
        await deleteKey(client, ws, action.payload)
      } else {
        console.log("No client found for connectionId:", connectionId)
        ws.send(
          JSON.stringify({
            type: VALKEY.KEYS.deleteKeyFailed,
            payload: {
              connectionId,
              key: action.payload?.key,
              error: "Invalid connection Id",
            },
          }),
        )
      }
    } else if (action.type === VALKEY.KEYS.addKeyRequested) {
      console.log("Handling addKeyRequested for key:", action.payload?.key)
      const client = clients.get(connectionId)
      if (client) {
        await addKey(client, ws, action.payload)
      } else {
        console.log("No client found for connectionId:", connectionId)
        ws.send(
          JSON.stringify({
            type: VALKEY.KEYS.addKeyFailed,
            payload: {
              connectionId,
              key: action.payload?.key,
              error: "Invalid connection Id",
            },
          }),
        )
      }
    } else if (action.type === VALKEY.KEYS.updateKeyRequested) {
      console.log("Handling updateKeyRequested for key:", action.payload?.key)
      const client = clients.get(connectionId)
      if (client) {
        await updateKey(client, ws, action.payload)
      } else {
        console.log("No client found for connectionId:", connectionId)
        ws.send(
          JSON.stringify({
            type: VALKEY.KEYS.addKeyFailed,
            payload: {
              connectionId,
              key: action.payload?.key,
              error: "Invalid connection Id",
            },
          }),
        )
      }
    }

    else {
      console.log("Unknown action type:", action.type)
    }
  })
  ws.onerror = (err) => {
    console.error("WebSocket error:", err)
  }
  ws.on("close", (code, reason) => {
    // Close all Valkey connections
    clients.forEach((client) => client.close())
    clients.clear()

    console.log("Client disconnected. Reason:", code, reason.toString())
  })
})
