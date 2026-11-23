// The get_big_keys tool: the largest keys by memory, as on the Valkey Admin big
// keys page. On a cluster it scans every node and merges the results.
import {
  VALKEY,
  type BigKey,
  type BigKeysErrorPayload,
  type BigKeysFulfilledPayload,
  type BigKeysRequestPayload,
  type BigKeysResponse,
  type NodeError
} from "valkey-common"
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

const bigKeySchema = z.object({
  key: z.string(),
  sizeBytes: z.number(),
  type: z.string(),
  ttl: z.number(),
  freq: z.number().nullable()
    .describe("LFU counter from OBJECT FREQ, on a log scale from 0 to 255 that decays over time. " +
      "Null unless maxmemory-policy is LFU. Use it to rank keys, not as a request count"),
  nodeId: z.string().optional(),
}) satisfies z.ZodType<BigKey>

const nodeErrorSchema = z.object({
  nodeId: z.string(),
  error: z.string(),
}) satisfies z.ZodType<NodeError>

const responseSchema = z.object({
  nodeId: z.string(),
  keys: z.array(bigKeySchema),
  scanned: z.number(),
  totalKeys: z.number(),
  scannedAt: z.number(),
}) satisfies z.ZodType<BigKeysResponse>

const fulfilledPayloadSchema = z.object({
  parsedResponse: responseSchema,
  nodeErrors: z.array(nodeErrorSchema).optional(),
}) satisfies z.ZodType<Pick<BigKeysFulfilledPayload, "parsedResponse" | "nodeErrors">>

const errorPayloadSchema = z.object({
  error: z.string(),
}) satisfies z.ZodType<Pick<BigKeysErrorPayload, "error">>

const outputSchema = responseSchema.omit({ nodeId: true }).extend({
  nodeErrors: z.array(nodeErrorSchema),
})

// Requests big keys, passing the cluster ID so the server queries every node.
// Throws NotReadyError while collectors are starting, either as the whole
// reply's error or when every node fails with that error.
const fetchBigKeys = async (admin: AdminClient, { topN, scanLimit }: z.infer<typeof inputSchema>) => {
  const reply = await admin.request(
    VALKEY.BIGKEYS.bigKeysRequested,
    ({ clusterId }) => {
      const payload: BigKeysRequestPayload = { connectionId: admin.connectionId, clusterId, topN, scanLimit }
      return { ...payload }
    },
    [VALKEY.BIGKEYS.bigKeysFulfilled, VALKEY.BIGKEYS.bigKeysError],
  )
  if (reply.type === VALKEY.BIGKEYS.bigKeysError) {
    const message = errorPayloadSchema.safeParse(reply.payload).data?.error ?? "Valkey Admin could not load big keys"
    throw message === METRICS_NOT_STARTED ? new NotReadyError(message) : new Error(message)
  }
  const { parsedResponse, nodeErrors = [] } = fulfilledPayloadSchema.parse(reply.payload)
  const { keys, scanned, totalKeys, scannedAt } = parsedResponse
  const result: z.infer<typeof outputSchema> = { keys, scanned, totalKeys, scannedAt, nodeErrors }
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
        "In cluster mode it covers every node. Scans up to scanLimit keys per node, which adds load to the instance, " +
        "and returns the largest of the keys it scanned.",
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
