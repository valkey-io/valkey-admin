import { ClusterResponse, GlideClient, GlideClusterClient, GlideReturnType } from "@valkey/valkey-glide"
import * as R from "ramda"
import { lookup, reverse } from "node:dns/promises"
import { sanitizeUrl } from "../../../common/src/url-utils"
import { VALKEY_CLIENT } from "../../../common/src/constants"

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
  clusterNodesMap: Map<string, string[]>) 
{
  const connection = clients.get(connectionId)
  const currentClusterId = connection?.clusterId
  return clusterNodesMap.get(currentClusterId!)?.length === 1
}

const isReadableString = (str: string): boolean => {
  return !str.includes('\uFFFD'); // Unicode replacement character when decoding fails
}

const getPrintableRatio = (str: string): number => {
  if (str.length === 0) return 1;

  const printableCount = [...str].filter(
    (char) => {
      const code = char.charCodeAt(0)
      
      return (
          (code >= 32 && code <= 126) // letters, numbers, punctuations
          || code === 9 // Tab
          || code === 10 // Line Feed
          || code === 13 // Carriage return
      )
    }
  ).length

  return printableCount / str.length;
}

export const isHumanReadable = (data: GlideReturnType): boolean => {
  if (typeof data !== 'string') {
    return false;
  }

  return isReadableString(data)
   && getPrintableRatio(data) >= VALKEY_CLIENT.HUMAN_READABLE.ACCEPTABLE_PRINTABLE_RATIO;
}

export const getHumanReadableString = (str: string): string => {
  return !isHumanReadable(str)
   ? VALKEY_CLIENT.HUMAN_READABLE.NOT_READABLE_MESSAGE 
   : str;
}

export type HumanReadableResult = string | HumanReadableResult[];

export const getHumanReadableElement = (element: GlideReturnType): HumanReadableResult => {
  if (Array.isArray(element)) {
    return element.map((item) => getHumanReadableElement(item));
  } else if (typeof element === "string") {
    return getHumanReadableString(element);
  }
  
  // For non-string, non-array types
  return VALKEY_CLIENT.HUMAN_READABLE.NOT_READABLE_MESSAGE;
}
