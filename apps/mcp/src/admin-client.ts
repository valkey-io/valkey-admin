// WebSocket client for the Valkey Admin server. Asks the server to connect to
// Valkey, as the UI does, then sends read-only requests and awaits the replies.
import WebSocket from "ws"
import { VALKEY, buildNormalizedConnectionId, toNodeId } from "valkey-common"
import type { AdminEndpoint, ConnectionConfig } from "./config"

export type AdminAction = {
  type: string
  payload?: Record<string, unknown>
}

export type ConnectionReplyDetails = {
  clusterId?: string
  keyEvictionPolicy?: string
  clusterSlotStatsEnabled?: boolean
}

export type AdminClient = {
  connectionId: string
  request: (
    type: string,
    payload: (details: ConnectionReplyDetails) => Record<string, unknown>,
    replyTypes: string[],
  ) => Promise<AdminAction>
}

const REPLY_TIMEOUT_MS = 10000

// The only actions request() will send; anything else is refused before it reaches the server.
const READ_ONLY_ACTIONS = new Set<string>([
  VALKEY.STATS.setData,
  VALKEY.BIGKEYS.bigKeysRequested,
  VALKEY.HOTKEYS.hotKeysRequested,
])

const CONNECT_REPLIES = [
  VALKEY.CONNECTION.standaloneConnectFulfilled,
  VALKEY.CONNECTION.clusterConnectFulfilled,
  VALKEY.CONNECTION.connectRejected,
]

// Parses a WebSocket message, or returns undefined if it is not JSON.
const parseAction = (data: WebSocket.RawData): AdminAction | undefined => {
  try {
    return JSON.parse(data.toString()) as AdminAction
  } catch {
    return undefined
  }
}

// Creates a client for one Valkey connection. Each request opens its own
// WebSocket, connects to Valkey and closes the WebSocket after the reply.
export const createAdminClient = (valkey: ConnectionConfig, admin: AdminEndpoint): AdminClient => {
  const connectionId = buildNormalizedConnectionId(valkey.host, valkey.port)
  const nodeId = toNodeId(connectionId)

  // Opens the WebSocket with the MCP origin and, when the server started this process, its token.
  const open = () =>
    new Promise<WebSocket>((resolve, reject) => {
      const url = new URL(admin.url)
      if (admin.token) url.searchParams.set("token", admin.token)
      const ws = new WebSocket(url, {
        headers: { origin: admin.origin },
      })
      ws.once("open", () => resolve(ws))
      ws.once("error", () => reject(new Error(`Cannot reach Valkey Admin at ${admin.url}. Is the server running?`)))
    })

  // True when a reply belongs to this connection, matched by connection, node or cluster ID.
  const isForThisConnection = ({ payload }: AdminAction, { clusterId }: ConnectionReplyDetails) =>
    payload?.connectionId === connectionId ||
    payload?.nodeId === nodeId ||
    (clusterId !== undefined && payload?.clusterId === clusterId)

  // Sends an action and resolves with the first reply of a listed type for this connection.
  // Rejects if the WebSocket closes or no reply arrives within REPLY_TIMEOUT_MS.
  const send = (ws: WebSocket, action: AdminAction, replyTypes: string[], details: ConnectionReplyDetails = {}) =>
    new Promise<AdminAction>((resolve, reject) => {
      const onMessage = (data: WebSocket.RawData) => {
        const reply = parseAction(data)
        if (reply && replyTypes.includes(reply.type) && isForThisConnection(reply, details)) {
          cleanup()
          resolve(reply)
        }
      }
      const onClose = () => {
        cleanup()
        reject(new Error("Valkey Admin closed the connection"))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`No reply from Valkey Admin for ${action.type}`))
      }, REPLY_TIMEOUT_MS)
      const cleanup = () => {
        clearTimeout(timer)
        ws.off("message", onMessage)
        ws.off("close", onClose)
      }
      ws.on("message", onMessage)
      ws.once("close", onClose)
      ws.send(JSON.stringify(action))
    })

  // Asks the server to connect to Valkey, as the UI's connect form does, and
  // returns the connection details from the reply, such as the cluster ID.
  const connect = async (ws: WebSocket): Promise<ConnectionReplyDetails> => {
    const reply = await send(ws, {
      type: VALKEY.CONNECTION.connectPending,
      payload: {
        connectionId,
        connectionDetails: {
          host: valkey.host,
          port: String(valkey.port),
          username: valkey.username,
          password: valkey.password,
          tls: valkey.useTLS,
          verifyTlsCertificate: true,
          endpointType: "node",
          db: 0,
        },
      },
    }, CONNECT_REPLIES)
    if (reply.type === VALKEY.CONNECTION.connectRejected) {
      throw new Error(String(reply.payload?.errorMessage ?? "Valkey Admin rejected the connection"))
    }
    return (reply.payload?.connectionDetails ?? {}) as ConnectionReplyDetails
  }

  return {
    connectionId,
    request: async (type, payload, replyTypes) => {
      if (!READ_ONLY_ACTIONS.has(type)) {
        throw new Error(`Action ${type} is not on the read-only allowlist`)
      }
      const ws = await open()
      try {
        const details = await connect(ws)
        return await send(ws, { type, payload: payload(details) }, replyTypes, details)
      } finally {
        ws.close()
      }
    },
  }
}
