import { 
  ClusterResponse, 
  GlideClient, 
  GlideClusterClient, 
  InfoOptions

} from "@valkey/valkey-glide"
import * as R from "ramda"
import { lookup, reverse } from "node:dns/promises"
import { KEY_EVICTION_POLICY, KeyEvictionPolicy, sanitizeUrl } from "valkey-common"
import { ClusterNodeMap } from "./metrics-orchestrator"
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

export async function getExistingClusterClient(
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
  try {
    const result = await clusterClient.customCommand(["CLUSTER", "SLOT-STATS", "ORDERBY", "KEY-COUNT", "LIMIT", "1"])
    // cpu-usec is only present when cluster-slot-stats-enabled is yes
    return JSON.stringify(result).includes("cpu-usec")
  } catch {
    console.warn("Cluster slot-stats is not enabled.")
    return false
  }
}

/**
 * Parsed Server_Version from `INFO server` (`redis_version` / `valkey_version`).
 *
 * `null` is returned when neither field is present or the value is unparseable.
 * Pre-release suffixes (e.g. `9.0.0-rc1`) are stripped before parsing so a
 * pre-release of 9.0.0 still parses to `{ major: 9, minor: 0, patch: 0 }`.
 */
export type ServerVersion = { major: number; minor: number; patch: number }

/**
 * Parse a raw version string into `{ major, minor, patch }`.
 *
 * Strips anything after the first non-digit/non-dot character before parsing
 * so pre-release suffixes (e.g. `9.0.0-rc1`) are tolerated. Missing minor/patch
 * components default to `0`. Returns `null` when no leading digits exist or
 * any component fails to parse as an integer.
 */
export const parseVersionString = (raw: string): ServerVersion | null => {
  const cleaned = raw.trim().match(/^[0-9.]+/)?.[0]
  if (!cleaned) return null

  const [majorPart, minorPart, patchPart] = cleaned.split(".")
  const major = majorPart ? Number(majorPart) : NaN
  const minor = minorPart ? Number(minorPart) : 0
  const patch = patchPart ? Number(patchPart) : 0

  if (
    !Number.isInteger(major) ||
    !Number.isInteger(minor) ||
    !Number.isInteger(patch)
  ) {
    return null
  }

  return { major, minor, patch }
}

/**
 * Read `INFO server` from the supplied client and return the parsed Server_Version.
 *
 * Prefers `valkey_version` because Valkey servers also expose a legacy
 * `redis_version` field (typically a Redis-compat version like 7.4.0) for
 * client compatibility, which would underreport the actual server version
 * for gating purposes. Falls back to `redis_version` for plain Redis servers
 * that don't emit `valkey_version`. Returns `null` when neither field is
 * present or the value is unparseable; callers should treat `null` as
 * "below 9.0.0" via `supportsClusterDb`.
 */
export async function getServerVersion(
  client: GlideClient | GlideClusterClient,
): Promise<ServerVersion | null> {
  try {
    const infoResponse = await client.info([InfoOptions.Server])
    // Server_Version is identical across cluster nodes, so any node's response works.
    const anyNode =
      typeof infoResponse === "string"
        ? infoResponse
        : Object.values(infoResponse)[0]
    if (typeof anyNode !== "string") return null

    const parsed = parseInfo(anyNode)
    const versionString = parsed["valkey_version"] ?? parsed["redis_version"]
    if (!versionString) return null

    return parseVersionString(versionString)
  } catch (err) {
    console.warn("Unable to get server version: ", err)
    return null
  }
}

/**
 * Cluster gating helper: cluster mode honors a non-zero Database_Index only on
 * Valkey/Redis Server_Version `>= 9.0.0`. Returns `true` only when a parsed
 * version is supplied and its `major` is at least `9`.
 */
export const supportsClusterDb = (v: ServerVersion | null): boolean =>
  v !== null && v.major >= 9

