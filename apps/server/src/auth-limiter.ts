import { MemoryStore } from "express-rate-limit"
import { buildConnectionId, toNodeId } from "valkey-common"
import { ownerOf } from "./owner"
import type { ConnectionDetails } from "./actions/connection"

/**
 * Failed-AUTH limit for user-supplied credentials.
 *
 * Valkey does not limit AUTH attempts, and every connect request becomes one,
 * so without this limit the server could be used to guess passwords. Failures
 * are counted per (node, owner identity) in a fixed window. The key is built
 * from the connection details, not from the client-supplied connectionId, so
 * a new connectionId does not reset the count.
 */
export const AUTH_FAILURE_LIMIT = 10
export const AUTH_FAILURE_WINDOW_MS = 60_000
export const AUTH_LOCKED_MESSAGE = "Too many failed authentication attempts. Try again later."

let store = new MemoryStore()
store.init({ windowMs: AUTH_FAILURE_WINDOW_MS } as Parameters<MemoryStore["init"]>[0])

export const _resetAuthLimiter = (): void => {
  store.shutdown()
  store = new MemoryStore()
  store.init({ windowMs: AUTH_FAILURE_WINDOW_MS } as Parameters<MemoryStore["init"]>[0])
}

export const authLimitKey = (details: ConnectionDetails): string =>
  `${toNodeId(buildConnectionId(details.host, details.port))}|${ownerOf(details)}`

const AUTH_ERROR_PATTERN = /WRONGPASS|NOAUTH|invalid username-password pair|user is disabled/i

export const isAuthError = (err: unknown): boolean =>
  AUTH_ERROR_PATTERN.test(err instanceof Error ? err.message : String(err))

export class AuthLockedError extends Error {
  constructor() {
    super(AUTH_LOCKED_MESSAGE)
    this.name = "AuthLockedError"
  }
}

// MemoryStore.get() can return a counter from an expired window until its
// next sweep, so the reset time is checked here.
const isLocked = async (key: string): Promise<boolean> => {
  const entry = await store.get(key)
  if (!entry) return false
  if (entry.resetTime && entry.resetTime.getTime() <= Date.now()) return false
  return entry.totalHits >= AUTH_FAILURE_LIMIT
}

/**
 * Run `fn`, which authenticates with the credentials in `details`. Throws
 * `AuthLockedError` without calling `fn` when the key is locked, and counts
 * a failure when `fn` fails with an authentication error.
 */
export async function withAuthLimit<T>(details: ConnectionDetails, fn: () => Promise<T>): Promise<T> {
  const key = authLimitKey(details)
  if (await isLocked(key)) throw new AuthLockedError()
  try {
    return await fn()
  } catch (err) {
    if (isAuthError(err)) await store.increment(key)
    throw err
  }
}
