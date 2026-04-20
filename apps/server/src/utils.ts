import { 
  ClusterResponse, 
  GlideClient, 
  GlideClusterClient, 
  InfoOptions

} from "@valkey/valkey-glide"
import * as R from "ramda"
import { lookup, reverse } from "node:dns/promises"
import { KEY_EVICTION_POLICY, KeyEvictionPolicy, sanitizeUrl, VALKEY } from "valkey-common"
import WebSocket from "ws"
import { ClusterNodeMap } from "./metrics-orchestrator"
import { subscribe } from "./node-watchers"
export const dns = {
  lookup,
  reverse,
}

type ParsedClusterInfo = {
  [host: string]: {
    [section: string]: {
      [key: string]: string
    }
  }
}

type FanoutItem = { key: string; value: string }

// detect that a response from cluster is for a list of nodes like [{key, value}]
const isFanout = (x: unknown): x is FanoutItem[] =>
  Array.isArray(x) &&
  x.every(
    (e) =>
      e &&
      typeof e === "object" &&
      typeof e.key === "string" &&
      typeof e.value === "string",
  )

export const parseInfo = (infoStr: string): Record<string, string> =>
  infoStr
    .split(/\r?\n/)
    .reduce((acc, line) => {
      if (!line || line.startsWith("#")) return acc

      const idx = line.indexOf(":")
      if (idx === -1) return acc

      const key = line.slice(0, idx).trim()
      const value = line.slice(idx + 1).trim()

      acc[key] = value
      return acc
    }, {} as Record<string, string>)

export const parseInfoFanout = (items: FanoutItem[]) =>
  items.map(({ key, value }) => ({
    key,
    value: parseInfo(value),
  }))

const looksLikeInfo = (x: unknown): x is string =>
  typeof x === "string" && x.includes(":")

type ParsedInfo = Record<string, string>
type ParsedFanout = Array<{ key: string; value: ParsedInfo }>
type ParseResponseOut = ParsedInfo | ParsedFanout | unknown

export const parseResponse = (x: unknown): ParseResponseOut =>
  isFanout(x)
    ? parseInfoFanout(x)
    : looksLikeInfo(x)
      ? parseInfo(x)
      : x

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
        sanitizeUrl(String(host)),
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

// Helps avoid duplicate connections
// If user connects with IP address and then connects with hostname, we want a single connection
export async function resolveHostnameOrIpAddress(hostnameOrIP: string) {
  const isIP = /^[0-9:.]+$/.test(hostnameOrIP)
  const hostnameType = isIP ? "ip" : "hostname"
  try {
    const addresses = isIP
      ? await dns.reverse(hostnameOrIP)
      : (await dns.lookup(hostnameOrIP, { family: 4, all: true })).map((result) => result.address)

    return { input: hostnameOrIP, hostnameType, addresses }
  } catch (err) {
    console.warn("Unable to resolve hostname or IP:", err)
    return { input: hostnameOrIP, hostnameType, addresses: [hostnameOrIP] }
  }
}

export async function isLastConnectedClusterNode(
  connectionId: string, 
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId? :string }>,
  connectedNodesByCluster: Map<string, string[]>) 
{
  const connection = clients.get(connectionId)
  const currentClusterId = connection?.clusterId
  return connectedNodesByCluster.get(currentClusterId!)?.length === 1
}

function isClusterClientEntry(
  entry: { client: GlideClient | GlideClusterClient; clusterId?: string } | undefined,
): entry is { client: GlideClusterClient; clusterId?: string } {
  return !!entry && entry.client instanceof GlideClusterClient
}

export async function clusterClientExists(
  discoveredClusterNodes: ClusterNodeMap, 
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
) {
  // Check if we've already connected to this cluster before 
  const existingKey = Object.keys(discoveredClusterNodes).find(
    (key) => isClusterClientEntry(clients.get(key)),
  )

  const existingConnection = existingKey
    ? clients.get(existingKey) as { client: GlideClusterClient; clusterId?: string }
    : undefined

  return existingConnection
}

export async function returnExistingClusterClient(
  existingClusterConnection: {client: GlideClusterClient, clusterId?: string},
  clients: Map<string, {client: GlideClient | GlideClusterClient, clusterId?: string}>,
  connectionId: string,
  connectedNodesByCluster: Map<string, string[]>,
  clusterNodesRegistry: ClusterRegistry,
  ws: WebSocket,
  discoveredClusterNodes: ClusterNodeMap,
) {
  const { client: existingClusterClient, clusterId: existingClusterId } = existingClusterConnection
  clients.set(connectionId, { client: existingClusterClient, clusterId: existingClusterId })
  clusterNodesRegistry[existingClusterId!] = discoveredClusterNodes
  if (!connectedNodesByCluster.get(existingClusterId!)?.includes(connectionId)) 
    connectedNodesByCluster.get(existingClusterId!)?.push(connectionId)
  subscribe(connectionId, ws)
  ws.send(
    JSON.stringify({
      type: VALKEY.CLUSTER.addCluster,
      payload: { clusterId: existingClusterId, clusterNodes: discoveredClusterNodes },
    }),
  )
  return existingClusterClient
}

export async function getKeyEvictionPolicy(client: GlideClient | GlideClusterClient) {
  let keyEvictionPolicy: KeyEvictionPolicy = KEY_EVICTION_POLICY.NO_EVICTION
  try {
    const infoResponse = await client.info([InfoOptions.Memory])
    // Get the info response on any node in the cluster, since eviction policy is the same across all nodes
    const anyNode = typeof infoResponse === "string" ? infoResponse : Object.values(infoResponse)[0]
    const parsed = parseInfo(anyNode)
    if (parsed["maxmemory_policy"]) {
      keyEvictionPolicy = parsed["maxmemory_policy"].toLowerCase() as KeyEvictionPolicy
    }
  } catch (err) {
    console.warn("Unable to get key eviction policy: ", err)
  }
  return keyEvictionPolicy
}

export async function getClusterSlotStatsEnabled(clusterClient: GlideClusterClient) {
  let clusterSlotStatsEnabled = false
  try {
    await clusterClient.customCommand(["CLUSTER", "SLOT-STATS", "SLOTSRANGE", "0", "0"])
    clusterSlotStatsEnabled = true
  } catch {
    console.warn("Cluster slot-stats is not enabled.")
  }
  return clusterSlotStatsEnabled
}

