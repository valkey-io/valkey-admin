import { WebSocket, WebSocketServer } from "ws"
import { Decoder, GlideClient } from "@valkey/valkey-glide"
import { VALKEY } from "../../../common/src/constants.ts"
import {
  getKeys,
  getKeyInfoSingle,
  deleteKey,
  addKey,
  updateKey
} from "./keys-browser.ts"

const wss = new WebSocketServer({ port: 8080 })

console.log("Websocket server running on localhost:8080")

wss.on("connection", (ws: WebSocket) => {
  console.log("Client connected.")
  const clients: Map<string, GlideClient> = new Map()

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
      if (client) {
        await setDashboardData(connectionId, client, ws)
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
    } else if (action.type === VALKEY.KEYS.getKeyTypeRequested) {
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
    } else if (action.type === VALKEY.KEYS.deleteKeyRequested) {
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

async function connectToValkey(
  ws: WebSocket,
  payload: {
    host: string;
    port: number;
    connectionId: string;
  },
  clients: Map<string, GlideClient>,
) {
  const addresses = [
    {
      host: payload.host,
      port: payload.port,
    },
  ]
  try {
    const client = await GlideClient.createClient({
      addresses,
      requestTimeout: 5000,
      clientName: "test_client",
    })

    clients.set(payload.connectionId, client)

    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectFulfilled,
        payload: {
          connectionId: payload.connectionId,
        },
      }),
    )

    return client
  } catch (err) {
    console.log("Error connecting to Valkey", err)
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectRejected,
        payload: {
          err,
          connectionId: payload.connectionId,
        },
      }),
    )
  }
}

async function setDashboardData(
  connectionId: string,
  client: GlideClient,
  ws: WebSocket,
) {
  const rawInfo = await client.info()
  const info = parseInfo(rawInfo)
  const rawMemoryStats = (await client.customCommand(["MEMORY", "STATS"], {
    decoder: Decoder.String,
  })) as Array<{
    key: string;
    value: string;
  }>

  const memoryStats = rawMemoryStats.reduce((acc, { key, value }) => {
    acc[key] = value
    return acc
  }, {} as Record<string, string>)

  ws.send(
    JSON.stringify({
      type: VALKEY.STATS.setData,
      payload: {
        connectionId,
        info: info,
        memory: memoryStats,
      },
    }),
  )
}

const parseInfo = (infoStr: string): Record<string, string> =>
  infoStr.split("\n").reduce((acc, line) => {
    if (!line || line.startsWith("#") || !line.includes(":")) return acc
    const [key, value] = line.split(":").map((part) => part.trim())
    acc[key] = value
    return acc
  }, {} as Record<string, string>)

async function sendValkeyRunCommand(
  client: GlideClient,
  ws: WebSocket,
  payload: { command: string; connectionId: string },
) {
  try {
    const rawResponse = (await client.customCommand(
      payload.command.split(" "),
    )) as string
    console.log("========")
    console.log(typeof rawResponse)
    console.log(rawResponse)
    console.log("========")

    // todo fixme!!! they are not all strings!
    const response =
      typeof rawResponse === "string" ? parseInfo(rawResponse) : rawResponse
    if (rawResponse.includes("ResponseError")) {
      ws.send(
        JSON.stringify({
          meta: { command: payload.command },
          type: VALKEY.COMMAND.sendFailed,
          payload: rawResponse,
        }),
      )
    }
    ws.send(
      JSON.stringify({
        meta: { connectionId: payload.connectionId, command: payload.command },
        type: VALKEY.COMMAND.sendFulfilled,
        payload: response,
      }),
    )
  } catch (err) {
    ws.send(
      JSON.stringify({
        meta: { connectionId: payload.connectionId, command: payload.command },
        type: VALKEY.COMMAND.sendFailed,
        payload: err,
      }),
    )
    console.log("Error sending command to Valkey", err)
  }
}
