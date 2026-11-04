import { DEPLOYMENT_TYPE } from "valkey-common"
import { timingSafeEqual } from "crypto"
import { isIP } from "net"
import type { IncomingMessage } from "http"

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
const LOCAL_PROTOCOLS = new Set(["http:", "https:"])
// Non-web origins a file:// renderer may present; accepted only with a valid token.
const ELECTRON_NONWEB_ORIGINS = new Set(["null", "file://"])
const ELECTRON_WS_TOKEN_ENV = "ELECTRON_WS_TOKEN"
export const ALLOW_ANY_HOST_ENV = "VALKEY_ADMIN_ALLOW_ANY_HOST"
const ALLOWED_ORIGINS_ENV = "VALKEY_ADMIN_ALLOWED_WS_ORIGINS"

// Hostnames already warned about, so one rebinding attempt does not fill the
// log. Capped because the names are attacker-chosen.
const MAX_WARNED_HOSTS = 100
const warnedHosts = new Set<string>()

export const isAllowAnyHost = () => process.env[ALLOW_ANY_HOST_ENV] === "true"

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

/**
 * True when the `Host` header names this machine: `localhost`, a `*.localhost`
 * name, or an IP literal. A DNS rebinding page can only use a name the
 * attacker controls, so it can never send one of these.
 */
const isLocalHostHeader = (req: IncomingMessage) => {
  const hostHeader = req.headers.host
  if (!hostHeader) return false
  let hostname: string
  try {
    hostname = new URL(`http://${hostHeader}`).hostname.toLowerCase()
  } catch {
    return false
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true
  return isIP(normalizeHost(hostname)) !== 0
}

const warnHostRefused = (req: IncomingMessage) => {
  const host = req.headers.host ?? ""
  if (warnedHosts.has(host)) return
  if (warnedHosts.size < MAX_WARNED_HOSTS) warnedHosts.add(host)
  const protocol = (() => { try { return new URL(req.headers.origin ?? "").protocol } catch { return "http:" } })()
  console.warn(
    `WebSocket upgrade refused: Host "${host}" is not a local name. `
      + `Set ${ALLOWED_ORIGINS_ENV}=${protocol}//${host} to allow it, `
      + `or ${ALLOW_ANY_HOST_ENV}=true to turn this check off.`,
  )
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
  const configuredOrigins = parseConfiguredOrigins(process.env[ALLOWED_ORIGINS_ENV])

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

  // When an allowlist is set, only the operator's listed origins can connect.
  if (configuredOrigins.size > 0) return false

  try { // Web mode with no allowlist: same origin, and a Host that names this machine
    const parsedOrigin = new URL(normalizedOrigin)
    if (!isSameOrigin(parsedOrigin, req)) return false
    if (isAllowAnyHost() || isLocalHostHeader(req)) return true
    warnHostRefused(req)
    return false
  } catch {
    return false
  }
}
