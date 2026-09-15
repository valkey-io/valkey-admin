import { DEPLOYMENT_TYPE } from "valkey-common"
import { timingSafeEqual } from "crypto"
import type { IncomingMessage } from "http"

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
const LOCAL_PROTOCOLS = new Set(["http:", "https:"])
// Non-web origins a file:// renderer may present; accepted only with a valid token.
const ELECTRON_NONWEB_ORIGINS = new Set(["null", "file://"])
const ELECTRON_WS_TOKEN_ENV = "ELECTRON_WS_TOKEN"

const normalizeHost = (hostname: string) => hostname.replace(/^\[|]$/g, "").toLowerCase()

const isLoopbackHostname = (hostname: string) =>
  LOCALHOST_HOSTNAMES.has(hostname.toLowerCase()) || normalizeHost(hostname) === "::1"

const isLoopbackOrigin = (origin: URL) =>
  LOCAL_PROTOCOLS.has(origin.protocol) && isLoopbackHostname(origin.hostname)

const normalizeOrigin = (origin: string) => {
  const trimmed = origin.trim()
  return trimmed === "file://" ? trimmed : trimmed.replace(/\/$/, "")
}

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

// Length-independent comparison so the token can't be recovered by timing.
const tokensMatch = (a: string, b: string) => {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // timingSafeEqual requires equal lengths; the token is fixed-length so this
  // guard leaks nothing useful.
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

// The renderer appends the per-launch token as `?token=...` on the WS URL.
const hasValidElectronToken = (req: IncomingMessage) => {
  const expected = process.env[ELECTRON_WS_TOKEN_ENV]
  // Fail closed: if no token was provisioned, the token gate cannot be satisfied.
  if (!expected) return false
  try {
    const url = new URL(req.url ?? "", "http://localhost")
    const provided = url.searchParams.get("token")
    return provided != null && tokensMatch(provided, expected)
  } catch {
    return false
  }
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
    // Require a valid per-launch token alongside the local renderer origin.
    let originLooksLocal = ELECTRON_NONWEB_ORIGINS.has(normalizedOrigin)
    if (!originLooksLocal) {
      try {
        originLooksLocal = isLoopbackOrigin(new URL(normalizedOrigin))
      } catch { // new URL can technically throw
        originLooksLocal = false
      }
    }
    return originLooksLocal && hasValidElectronToken(req)
  }

  try { // for Web deployment — only same origin is allowed
    const parsedOrigin = new URL(normalizedOrigin)
    return isSameOrigin(parsedOrigin, req)
  } catch {
    return false
  }
}
