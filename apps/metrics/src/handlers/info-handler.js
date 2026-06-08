import { Decoder } from "@valkey/valkey-glide"

const getPreferredNodeKey = () => {
  const host = process.env.VALKEY_HOST
  const port = process.env.VALKEY_PORT
  return host && port ? `${host}:${port}` : null
}

const normalizeNodeScopedResponse = (result) => {
  if (Array.isArray(result) || typeof result === "string" || result == null) {
    return result
  }

  if (typeof result === "object") {
    const preferredNodeKey = getPreferredNodeKey()
    if (preferredNodeKey && preferredNodeKey in result) {
      return result[preferredNodeKey]
    }
    const firstValue = Object.values(result)[0]
    return firstValue ?? result
  }

  return result
}

const parseInfo = (raw) =>
  String(raw ?? "")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) return acc

      const idx = trimmed.indexOf(":")
      if (idx === -1) return acc

      acc[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
      return acc
    }, {})

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
