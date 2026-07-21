import crypto from "crypto"
import type { IncomingMessage } from "http"

const SESSION_COOKIE_NAME = "vk_sid"
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const SWEEP_INTERVAL_MS = 60 * 1000

type Session = {
  connectionIds: Set<string>
  expireAt: number
}

// this listener is called when a session expires and has connections that are no longer authorized
type SessionExpiryListener = (connectionIds: string[]) => void

const sessions = new Map<string, Session>()
let onSessionExpiry: SessionExpiryListener | undefined

export const setSessionExpiryListener = (listener: SessionExpiryListener): void => {
  onSessionExpiry = listener
}

const isExpired = (session: Session) => session.expireAt <= Date.now()

const parseSessionId = (req: IncomingMessage): string | undefined => {
  for (const part of req.headers.cookie?.split(";") ?? []) {
    const [name, ...value] = part.trim().split("=")
    if (name === SESSION_COOKIE_NAME) return value.join("=")
  }
  return undefined
}

// Expire the session and notify the listener of any connections that are no longer authorized
const expireSession = (sessionId: string, session: Session): void => {
  sessions.delete(sessionId)
  const orphaned = [...session.connectionIds].filter((id) => !hasAuthorizedSession(id))
  if (orphaned.length > 0) onSessionExpiry?.(orphaned)
}

// Get the session if it exists and is not expired, otherwise return undefined
const getSession = (sessionId: string | undefined): Session | undefined => {
  if (!sessionId) return undefined
  const session = sessions.get(sessionId)
  if (!session) return undefined
  if (isExpired(session)) {
    expireSession(sessionId, session)
    return undefined
  }
  return session
}

// True over HTTPS (directly or behind a proxy), so we only add the Secure cookie flag then.
const isSecureRequest = (req: IncomingMessage): boolean => {
  const forwarded = req.headers["x-forwarded-proto"]
  const proto = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim()
  if (proto) return proto === "https"
  return Boolean((req.socket as { encrypted?: boolean }).encrypted)
}

const buildSetCookie = (sessionId: string, req: IncomingMessage): string => {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ]
  if (isSecureRequest(req)) attributes.push("Secure")
  return attributes.join("; ")
}

// create a new session or refresh an existing one, returning the session ID and the Set-Cookie header value
export const ensureSession = (req: IncomingMessage): { sessionId: string; setCookie: string } => {
  const existingId = parseSessionId(req)
  const existing = getSession(existingId)
  const sessionId = existing && existingId ? existingId : crypto.randomBytes(32).toString("hex")

  const session = existing ?? { connectionIds: new Set<string>(), expireAt: 0 }
  session.expireAt = Date.now() + SESSION_TTL_MS
  sessions.set(sessionId, session)

  return { sessionId, setCookie: buildSetCookie(sessionId, req) }
}

export const authorizeConnection = (sessionId: string | undefined, connectionId: string): void => {
  getSession(sessionId)?.connectionIds.add(connectionId)
}

export const isConnectionAuthorized = (sessionId: string | undefined, connectionId: string): boolean =>
  getSession(sessionId)?.connectionIds.has(connectionId) ?? false

export const revokeConnection = (sessionId: string | undefined, connectionId: string): void => {
  getSession(sessionId)?.connectionIds.delete(connectionId)
}

// check if a connection is authorized by any session, not just the one provided
export const hasAuthorizedSession = (connectionId: string): boolean => {
  for (const session of sessions.values()) {
    if (!isExpired(session) && session.connectionIds.has(connectionId)) return true
  }
  return false
}

// sweep expired sessions every minute, notifying the listener of any connections that are no longer authorized
setInterval(() => {
  for (const [id, session] of sessions) {
    if (isExpired(session)) expireSession(id, session)
  }
}, SWEEP_INTERVAL_MS).unref()

export const _resetSessions = (): void => {
  sessions.clear()
  onSessionExpiry = undefined
}
