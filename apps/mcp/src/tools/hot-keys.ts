// The get_hot_keys tool: the most frequently accessed keys in a cluster, found
// from the hottest slots by CPU time and ranked by LFU frequency.
import { VALKEY } from "valkey-common"
import { z } from "zod"
import { METRICS_NOT_STARTED, NotReadyError, retryWhileNotReady } from "./not-ready"
import { toolResult } from "./tool-result"
import type { AdminClient, ConnectionDetails } from "../admin-client"
import type { McpServer } from "@modelcontextprotocol/server"

const inputSchema = z.object({
  count: z.number().int().min(1).max(100).default(20)
    .describe("How many of the hottest keys to return"),
})

const hotKeyTupleSchema = z.tuple([z.string(), z.number(), z.number().nullable(), z.number(), z.string(), z.number().optional()])

const replySchema = z.object({
  parsedResponse: z.object({
    hotKeys: z.array(hotKeyTupleSchema),
    lastCollectedAt: z.number().nullable().optional(),
  }),
  nodeErrors: z.array(z.object({ nodeId: z.string(), error: z.string() })).optional(),
})

const outputSchema = z.object({
  hotKeys: z.array(z.object({
    key: z.string(),
    accessFrequency: z.number(),
    sizeBytes: z.number().nullable(),
    ttl: z.number(),
    nodeId: z.string(),
    slotId: z.number().optional(),
  })),
  collectedAt: z.number().nullable(),
  nodeErrors: z.array(z.object({ nodeId: z.string(), error: z.string() })),
})

// Lists the settings the connection lacks for hot keys: cluster mode, slot stats and an LFU eviction policy.
const missingRequirements = ({ clusterId, keyEvictionPolicy, clusterSlotStatsEnabled }: ConnectionDetails) => [
  ...(clusterId ? [] : ["cluster mode"]),
  ...(clusterSlotStatsEnabled ? [] : ["cluster-slot-stats-enabled yes"]),
  ...(keyEvictionPolicy?.includes("lfu") ? [] : ["an LFU maxmemory-policy such as allkeys-lfu"]),
]

// Checks the requirements, requests hot keys for the whole cluster and turns
// the server's tuples into named fields. Throws NotReadyError while every
// node's collector is still starting.
const fetchHotKeys = async (admin: AdminClient, { count }: z.infer<typeof inputSchema>) => {
  const details = await admin.details()
  const missing = missingRequirements(details)
  if (missing.length > 0) {
    throw new Error(`Hot keys use cluster slot stats, which need ${missing.join(", ")}`)
  }
  const reply = await admin.request(
    {
      type: VALKEY.HOTKEYS.hotKeysRequested,
      payload: {
        connectionId: admin.connectionId,
        clusterId: details.clusterId,
        lfuEnabled: true,
        clusterSlotStatsEnabled: true,
        count,
      },
    },
    [VALKEY.HOTKEYS.hotKeysFulfilled, VALKEY.HOTKEYS.hotKeysError],
  )
  if (reply.type === VALKEY.HOTKEYS.hotKeysError) {
    throw new Error(String(reply.payload?.error ?? "Valkey Admin could not load hot keys"))
  }
  const { parsedResponse, nodeErrors = [] } = replySchema.parse(reply.payload)
  if (parsedResponse.hotKeys.length === 0 && nodeErrors.length > 0 && nodeErrors.every(({ error }) => error === METRICS_NOT_STARTED)) {
    throw new NotReadyError(METRICS_NOT_STARTED)
  }
  return {
    hotKeys: parsedResponse.hotKeys.map(([key, accessFrequency, sizeBytes, ttl, nodeId, slotId]) =>
      ({ key, accessFrequency, sizeBytes, ttl, nodeId, slotId })),
    collectedAt: parsedResponse.lastCollectedAt ?? null,
    nodeErrors,
  }
}

// Registers get_hot_keys on the MCP server.
export const registerHotKeys = (server: McpServer, admin: AdminClient) =>
  server.registerTool(
    "get_hot_keys",
    {
      title: "Hot keys (via Valkey Admin)",
      description:
        "Returns the most frequently accessed keys across the cluster, found from the hottest slots by CPU time (CLUSTER SLOT-STATS) " +
        "and ranked by LFU access frequency. Requires cluster mode, cluster-slot-stats-enabled and an LFU maxmemory-policy.",
      inputSchema,
      outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => toolResult(await retryWhileNotReady(() => fetchHotKeys(admin, input))),
  )
