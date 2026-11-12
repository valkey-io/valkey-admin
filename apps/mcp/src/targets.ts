// Named targets: parses VALKEY_ADMIN_MCP_TARGETS (name=host:port or name=valkeys://host:port)
// into connections, and reads the target name from an /mcp/<target> request path.
import type { ConnectionConfig } from "./config"

const DEFAULT_PORT = 6379
const NAME_PATTERN = /^[A-Za-z0-9_-]+$/
const PATH_PATTERN = /^\/mcp\/([A-Za-z0-9_-]+)$/
const TLS_BY_PROTOCOL = new Map([["valkey:", false], ["valkeys:", true]])

export type Credentials = Pick<ConnectionConfig, "username" | "password">

export const targetFromPath = (pathname: string) => PATH_PATTERN.exec(pathname)?.[1]

const parseAddress = (address: string) => {
  try {
    return new URL(address.includes("://") ? address : `valkey://${address}`)
  } catch {
    return undefined
  }
}

const parseTarget = (entry: string, position: number, credentials: Credentials): [string, ConnectionConfig] => {
  const separator = entry.indexOf("=")
  const name = entry.slice(0, separator).trim()
  const url = parseAddress(entry.slice(separator + 1).trim())
  const useTLS = url && TLS_BY_PROTOCOL.get(url.protocol)
  const isPlainAddress = url && url.hostname && !url.username && !url.password
    && ["", "/"].includes(url.pathname) && !url.search && !url.hash
  if (separator < 1 || !NAME_PATTERN.test(name) || useTLS === undefined || !isPlainAddress) {
    throw new Error(
      `Invalid VALKEY_ADMIN_MCP_TARGETS entry ${position}. Use name=host:port or name=valkeys://host:port, `
        + "with a name of letters, digits, - and _",
    )
  }
  return [name, {
    host: url.hostname.replace(/^\[|]$/g, ""),
    port: Number(url.port || DEFAULT_PORT),
    ...credentials,
    useTLS,
  }]
}

export const parseTargets = (value: string, credentials: Credentials) => {
  const targets = new Map<string, ConnectionConfig>()
  value.split(",").map((entry) => entry.trim()).filter(Boolean).forEach((entry, index) => {
    const [name, connection] = parseTarget(entry, index + 1, credentials)
    if (targets.has(name)) throw new Error(`VALKEY_ADMIN_MCP_TARGETS names "${name}" twice`)
    targets.set(name, connection)
  })
  if (targets.size === 0) throw new Error("VALKEY_ADMIN_MCP_TARGETS lists no targets")
  return targets
}
