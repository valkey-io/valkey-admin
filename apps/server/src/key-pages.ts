import { randomUUID } from "node:crypto"
import { GlideClusterClient, type GlideClient, type RouteOption } from "@valkey/valkey-glide"
import { KEY_PAGE_SIZE, type KeyPageRequest } from "valkey-common"

type Client = GlideClient | GlideClusterClient
type NodeScan = { cursor: string; address?: string; pending: string[] }
type Progress = { client: Client; query: string; nodes: NodeScan[]; expires: number }
const continuations = new WeakMap<object, Map<string, Progress>>()
const lifetime = 30 * 60 * 1000
export class KeyScanExpiredError extends Error {
  /** Marks an unusable continuation so the UI offers a fresh scan instead of retry. */
  constructor() {
    super("Key scan expired or changed. Restart the scan to continue.")
  }
}
const allowedTypes = new Set(["string", "hash", "list", "set", "zset", "stream", "rejson-rl"])

/** Bounded SCAN pages. Tokens belong to one websocket and one connection/query. */
export async function scanKeyPage(client: Client, owner: object, payload: KeyPageRequest) {
  if (payload.keyType && !allowedTypes.has(payload.keyType)) throw new Error("Unsupported key type")
  const query = JSON.stringify([payload.connectionId, payload.pattern ?? "*", payload.keyType ?? ""])
  let tokens = continuations.get(owner)
  if (!tokens) {
    tokens = new Map()
    continuations.set(owner, tokens)
  }
  for (const [token, state] of tokens) if (state.expires < Date.now()) tokens.delete(token)
  /** Builds a bounded scan with the same filters on every primary and page. */
  const command = (cursor: string, count = KEY_PAGE_SIZE) => [
    "SCAN", cursor, "MATCH", payload.pattern ?? "*", "COUNT", String(count),
    ...(payload.keyType ? ["TYPE", payload.keyType] : []),
  ]
  let nodes: NodeScan[]
  if (payload.cursor && payload.cursor !== "0") {
    const saved = tokens.get(payload.cursor)
    if (!saved || saved.client !== client || saved.query !== query) {
      throw new KeyScanExpiredError()
    }
    // Keep input tokens immutable so retries cannot skip a partially consumed page.
    nodes = saved.nodes.map((node) => ({ ...node, pending: [...node.pending] }))
    if (client instanceof GlideClusterClient) {
      // A small probe discovers addresses without adding command permissions.
      const primaries = await client.customCommand(command("0", 1), { route: "allPrimaries" }) as
        { key: string; value: [string, string[]] }[]
      const addresses = new Set(primaries.map(({ key }) => key))
      if (nodes.some((node) => node.address && !addresses.has(node.address))) {
        throw new KeyScanExpiredError()
      }
    }
  } else if (client instanceof GlideClusterClient) {
    const results = await client.customCommand(command("0"), { route: "allPrimaries" }) as
      { key: string; value: [string, string[]] }[]
    nodes = results.map(({ key, value }) => ({ address: key, cursor: value[0], pending: value[1] }))
  } else {
    const [cursor, pending] = await client.customCommand(command("0")) as [string, string[]]
    nodes = [{ cursor, pending }]
  }
  const keys = new Set<string>()
  let scans = 0
  while (nodes.length && keys.size < KEY_PAGE_SIZE) {
    const node = nodes.shift()!
    while (node.pending.length && keys.size < KEY_PAGE_SIZE) keys.add(node.pending.shift()!)
    if (!node.pending.length && node.cursor !== "0" && scans < 8 && keys.size < KEY_PAGE_SIZE) {
      let route: RouteOption | undefined
      if (node.address) {
        const split = node.address.lastIndexOf(":")
        route = { route: { type: "routeByAddress", host: node.address.slice(0, split), port: Number(node.address.slice(split + 1)) } }
      }
      const [cursor, pending] = await client.customCommand(command(node.cursor), route) as [string, string[]]
      node.cursor = cursor
      node.pending = pending
      scans++
    }
    if (node.pending.length || node.cursor !== "0") nodes.push(node)
    if (scans >= 8 && nodes.every((item) => item.pending.length === 0)) break
  }
  let cursor = "0"
  if (nodes.length) {
    cursor = randomUUID()
    tokens.set(cursor, { client, query, nodes, expires: Date.now() + lifetime })
    while (tokens.size > 32) tokens.delete(tokens.keys().next().value!)
  }
  return { keys: [...keys].sort(), cursor }
}
