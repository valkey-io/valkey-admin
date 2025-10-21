import { WebSocket, WebSocketServer } from "ws"
import {  ClusterResponse, Decoder, GlideClient, GlideClusterClient, InfoOptions } from "@valkey/valkey-glide"
import * as R from "ramda"
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

async function connectToValkey(
  ws: WebSocket,
  payload: {
    host: string;
    port: number;
    connectionId: string;
  },
  clients: Map<string, GlideClient | GlideClusterClient>,
) {

  const addresses = [
    {
      host: payload.host,
      port: payload.port,
    },
  ]
  try {
    const standaloneClient = await GlideClient.createClient({
      addresses,
      requestTimeout: 5000,
      clientName: "test_client",
    })

    if (await belongsToCluster(standaloneClient)) {
      return connectToCluster(standaloneClient, ws, clients, payload, addresses)
    }
    
    clients.set(payload.connectionId, standaloneClient)
    ws.send(
      JSON.stringify({
        type: VALKEY.CONNECTION.connectFulfilled,
        payload: {
          connectionId: payload.connectionId,
        },
      }),
    )
    return standaloneClient

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

async function belongsToCluster(client: GlideClient): Promise<boolean> {
  const response = await client.info([InfoOptions.Cluster])
  const parsed = parseInfo(response)
  return parsed["cluster_enabled"] === "1"
}

async function discoverCluster(client: GlideClient) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await client.customCommand(["CLUSTER", "SLOTS"]) as any[][]

    const { clusterId } = R.applySpec({
      firstSlotRange: R.nth(0),
      firstPrimaryNode: R.path([0, 2]), // firstSlotRange[2]
      clusterId: R.path([0, 2, 2]), // firstPrimaryNode[2]
    })(response)

    const clusterNodes = response.reduce((acc, slotRange) => {
      const [, , ...nodes] = slotRange

      return nodes.reduce((nodesById, [host, port], idx) => {
        const id = `${host}-${port}`
        return nodesById[id]
          ? nodesById
          :  { ...nodesById, [id]: { host, port, role: idx === 0 ? "primary" : "replica" } }
      }, acc)
    }, {} as Record<string, {
      host: string;
      port: number;
      role: "primary" | "replica";
    }>)

    return { clusterNodes, clusterId }
  } catch (err) {
    console.error("Error discovering cluster:", err)
    throw new Error("Failed to discover cluster") 
    
  }
}

async function connectToCluster(
  standaloneClient: GlideClient, 
  ws: WebSocket, 
  clients: Map<string, GlideClient | GlideClusterClient>, 
  payload: { host: string; port: number; connectionId: string;},
  addresses: { host: string, port: number | undefined }[],
) {
  const { clusterNodes, clusterId } = await discoverCluster(standaloneClient)
  if (R.isEmpty(clusterNodes)) {
    throw new Error("No cluster nodes discovered")
  }
  // May remove this if we agree to remove clusterSlice
  ws.send(
    JSON.stringify({
      type: VALKEY.CLUSTER.addCluster,
      payload: { clusterId, clusterNodes },
    }),
  )
  const clusterClient = await GlideClusterClient.createClient({
    addresses,
    requestTimeout: 5000,
    clientName: "cluster_client",
  })

  clients.set(payload.connectionId, clusterClient)

  ws.send(
    JSON.stringify({
      type: VALKEY.CONNECTION.connectFulfilled,
      payload: {
        connectionId: payload.connectionId,
        clusterNodes,
        clusterId: clusterId,
      },
    }),
  )
  return clusterClient
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

async function setClusterDashboardData(
  clusterId: string,
  client: GlideClusterClient,
  ws: WebSocket,
) {
  const rawInfo = await client.info({ route:"allNodes" })
  const info = parseClusterInfo(rawInfo)
  
  ws.send(
    JSON.stringify({
      type: VALKEY.CLUSTER.setClusterData,
      payload: {
        clusterId,
        info: info,
      },
    }),
  )
}

type ParsedClusterInfo = {
  [host: string]: {
    [section: string]: {
      [key: string]: string
    }
  }
}

export const parseClusterInfo = (rawInfo: ClusterResponse<string>): ParsedClusterInfo =>
{
  // Required to satisfy compiler
  if (typeof rawInfo !== "object" || rawInfo === null) {
    throw new Error("Invalid ClusterResponse: expected an object with host keys.")
  }
  return R.pipe(
    R.toPairs,
    R.map(([host, infoString]) =>
      [
        host,
        R.pipe(
          R.split("\r\n"),
          R.reduce(
            (
              state: { currentSection: string | null; hostData: ParsedClusterInfo[string] },
              line: string,
            ) => {
              const trimmed = line.trim()
              if (trimmed === "") return state

              if (trimmed.startsWith("# ")) {
                const section = trimmed.slice(2).trim()
                state.currentSection = section
                state.hostData[section] = state.hostData[section] || {}
                return state
              }

              if (!state.currentSection) return state

              const idx = line.indexOf(":")
              if (idx === -1) return state

              const key = line.slice(0, idx)
              const value = line.slice(idx + 1)

              state.hostData[state.currentSection] = state.hostData[state.currentSection] || {}
              state.hostData[state.currentSection]![key] = value
              return state
            },
            { currentSection: null, hostData: {} },
          ),
          (s: { hostData: ParsedClusterInfo[string] }) => s.hostData,
        )(infoString as string),
      ] as [string, ParsedClusterInfo[string]],
    ),
    R.fromPairs,
  )(rawInfo) as ParsedClusterInfo
}
  
const parseInfo = (infoStr: string): Record<string, string> =>
  infoStr.split("\n").reduce((acc, line) => {
    if (!line || line.startsWith("#") || !line.includes(":")) return acc
    const [key, value] = line.split(":").map((part) => part.trim())
    acc[key] = value
    return acc
  }, {} as Record<string, string>)

async function sendValkeyRunCommand(
  client: GlideClient | GlideClusterClient,
  ws: WebSocket,
  payload: { command: string; connectionId: string },
) {
  try {
    const rawResponse = (await client.customCommand(
      payload.command.split(" "),
    )) as string

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
