import { DEPLOYMENT_TYPE } from "valkey-common"
import type { IncomingMessage } from "http"

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
const LOCAL_PROTOCOLS = new Set(["http:", "https:"])
// Electron file:// renderers may send Origin as "file://" or "null" on the WebSocket handshake.
const ELECTRON_ORIGINS = new Set(["null", "file://"])

const normalizeHost = (hostname: string) => hostname.replace(/^\[|]$/g, "").toLowerCase()

const isLoopbackHostname = (hostname: string) =>
  LOCALHOST_HOSTNAMES.has(hostname.toLowerCase()) || normalizeHost(hostname) === "::1"

const isLoopbackOrigin = (origin: URL) =>
  LOCAL_PROTOCOLS.has(origin.protocol) && isLoopbackHostname(origin.hostname)

const normalizeOrigin = (origin: string) => origin.trim().replace(/\/$/, "")

const parseConfiguredOrigins = (configuredOrigins: string | undefined) =>
  new Set(
    (configuredOrigins ?? "")
      .split(",")
      .map(normalizeOrigin)
      .filter(Boolean),
  )

const isSameOrigin = (origin: URL, req: IncomingMessage) => {
  const hostHeader = req.headers.host
  if (!hostHeader) return false

  return normalizeOrigin(origin.origin) === `${origin.protocol}//${hostHeader.toLowerCase()}`
}

export const isAllowedWebSocketOrigin = (req: IncomingMessage) => {
  // Browsers send Origin on WebSocket handshakes, so we can reject cross-site pages before accepting the upgrade.
  const originHeader = req.headers.origin
  const deploymentMode = process.env.DEPLOYMENT_MODE
  const configuredOrigins = parseConfiguredOrigins(process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS)

  if (!originHeader) {
    return false
  }

  const normalizedOrigin = normalizeOrigin(originHeader)

  if (configuredOrigins.has(normalizedOrigin)) {
    return true
  }

  if (deploymentMode === DEPLOYMENT_TYPE.ELECTRON) {
    try {
      return ELECTRON_ORIGINS.has(normalizedOrigin) || isLoopbackOrigin(new URL(normalizedOrigin))
    } catch { // new URL can technically throw
      return false
    }
  }

  try { // for Web deployment — only same origin is allowed
    const parsedOrigin = new URL(normalizedOrigin)
    return isSameOrigin(parsedOrigin, req)
  } catch {
    return false
  }
}
