// The get_big_keys tool: the largest keys by memory, as on the Valkey Admin big
// keys page. On a cluster it scans every node and merges the results.
import { VALKEY } from "valkey-common"
import { z } from "zod"
import { METRICS_NOT_STARTED, NotReadyError, retryWhileNotReady } from "./not-ready"
import { toolResult } from "./tool-result"
import type { AdminClient } from "../admin-client"
import type { McpServer } from "@modelcontextprotocol/server"

const inputSchema = z.object({
  topN: z.number().int().min(1).max(100).default(20)
    .describe("How many of the largest keys to return"),
  scanLimit: z.number().int().min(1).max(100000).default(10000)
    .describe("Maximum number of keys to scan per node"),
})

const outputSchema = z.object({
  keys: z.array(z.object({
    key: z.string(),
    sizeBytes: z.number(),
    type: z.string(),
    ttl: z.number(),
    freq: z.number().nullable(),
    nodeId: z.string().optional(),
  })),
  scanned: z.number(),
  totalKeys: z.number(),
  scannedAt: z.number(),
  nodeErrors: z.array(z.object({ nodeId: z.string(), error: z.string() })),
})

// Requests big keys, passing the cluster ID so the server queries every node.
// Throws NotReadyError while collectors are starting, including when every
// node reports that as a node error.
const fetchBigKeys = async (admin: AdminClient, { topN, scanLimit }: z.infer<typeof inputSchema>) => {
  const details = await admin.details()
  const reply = await admin.request(
    {
      type: VALKEY.BIGKEYS.bigKeysRequested,
      payload: { connectionId: admin.connectionId, clusterId: details.clusterId, topN, scanLimit },
    },
    [VALKEY.BIGKEYS.bigKeysFulfilled, VALKEY.BIGKEYS.bigKeysError],
  )
  if (reply.type === VALKEY.BIGKEYS.bigKeysError) {
    const message = String(reply.payload?.error ?? "Valkey Admin could not load big keys")
    throw message === METRICS_NOT_STARTED ? new NotReadyError(message) : new Error(message)
  }
  const result = outputSchema.parse({
    ...(reply.payload?.parsedResponse as object),
    nodeErrors: reply.payload?.nodeErrors ?? [],
  })
  if (result.keys.length === 0 && result.nodeErrors.length > 0 && result.nodeErrors.every(({ error }) => error === METRICS_NOT_STARTED)) {
    throw new NotReadyError(METRICS_NOT_STARTED)
  }
  return result
}

// Registers get_big_keys on the MCP server.
export const registerBigKeys = (server: McpServer, admin: AdminClient) =>
  server.registerTool(
    "get_big_keys",
    {
      title: "Big keys (via Valkey Admin)",
      description:
        "Returns the largest keys by memory, as shown on the Valkey Admin big keys page. " +
        "In cluster mode it covers every node. Scans up to scanLimit keys per node, which adds load to the instance.",
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => toolResult(await retryWhileNotReady(() => fetchBigKeys(admin, input))),
  )
