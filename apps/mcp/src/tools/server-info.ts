// The get_server_info tool: the INFO and memory data shown on the Valkey Admin
// dashboard. On a cluster it covers only the node the client connected to.
import { METRICS_SERVER_NOT_READY, VALKEY } from "valkey-common"
import { z } from "zod"
import { NotReadyError, retryWhileNotReady } from "./not-ready"
import { toolResult } from "./tool-result"
import type { AdminClient } from "../admin-client"
import type { McpServer } from "@modelcontextprotocol/server"

const outputSchema = z.object({
  info: z.record(z.string(), z.unknown()),
  memory: z.record(z.string(), z.unknown()),
})

// Requests the dashboard data and turns an error reply into a thrown error, marking "not ready" errors as retryable.
const fetchServerInfo = async (admin: AdminClient) => {
  const reply = await admin.request(
    { type: VALKEY.STATS.setData, payload: { connectionId: admin.connectionId } },
    [VALKEY.STATS.setData, VALKEY.STATS.setError],
  )
  if (reply.type === VALKEY.STATS.setData) return outputSchema.parse(reply.payload)
  const message = String(reply.payload?.error ?? "Valkey Admin could not load server info")
  throw reply.payload?.errorKind === METRICS_SERVER_NOT_READY ? new NotReadyError(message) : new Error(message)
}

// Registers get_server_info on the MCP server.
export const registerServerInfo = (server: McpServer, admin: AdminClient) =>
  server.registerTool(
    "get_server_info",
    {
      title: "Server info (via Valkey Admin)",
      description:
        "Returns the Valkey INFO and memory data that the Valkey Admin dashboard shows, fetched through the running Valkey Admin server.",
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => toolResult(await retryWhileNotReady(() => fetchServerInfo(admin))),
  )
