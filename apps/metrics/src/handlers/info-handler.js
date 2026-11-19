import { Decoder } from "@valkey/valkey-glide"
import { normalizeNodeScopedResponse, parseInfo } from "../utils/helpers.js"

// gets the dashboard payload ({ info, memory }) for the node (dashboard data are per node)
export const getDashboardInfo = async (client) => {
  const rawInfo = normalizeNodeScopedResponse(await client.info())
  const info = parseInfo(rawInfo)

  const rawMemoryStats = await client
    .customCommand(["MEMORY", "STATS"], { decoder: Decoder.String })
    .catch(() => [])

  const memory = rawMemoryStats.reduce((acc, { key, value }) => {
    acc[key] = value
    return acc
  }, {})

  return { info, memory }
}
