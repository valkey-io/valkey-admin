import { identityOf, type IdentityDetails } from "./owner"
import type { Endpoint } from "valkey-common"

/**
 * Failed-AUTH limit for user-supplied credentials.
 *
 * Valkey does not limit AUTH attempts, and every connect request becomes one,
 * so without this limit the server could be used to guess passwords. Failures
 * are counted per (node, identity) in a fixed window. An attempt that is still
 * in progress also takes a slot, so a burst of concurrent attempts cannot pass
 * the check before the first failure is counted. The key is built from
 * the normalized endpoint, not from the client-supplied connectionId or the
 * raw host and port strings, so a new connectionId or another spelling of the
 * same endpoint does not reset the count.
 */
export const AUTH_FAILURE_LIMIT = 10
export const AUTH_FAILURE_WINDOW_MS = 60_000
export const AUTH_LOCKED_MESSAGE = "Too many failed authentication attempts. Try again later."

/** Failures and attempts in progress for one key, in one fixed window. */
type AuthWindow = { count: number; end: number }

const windows = new Map<string, AuthWindow>()

// Remove ended windows so keys that are not used again do not stay in memory.
setInterval(() => {
  const now = Date.now()
  for (const [key, window] of windows) {
    if (window.end <= now) windows.delete(key)
  }
}, AUTH_FAILURE_WINDOW_MS).unref()

export const _resetAuthLimiter = (): void => {
  windows.clear()
}

export const authLimitKey = (details: IdentityDetails, endpoint: Endpoint): string =>
  `${endpoint.host}:${endpoint.port}|${identityOf(details)}`

const AUTH_ERROR_PATTERN = /WRONGPASS|NOAUTH|invalid username-password pair|user is disabled/i

export const isAuthError = (err: unknown): boolean =>
  AUTH_ERROR_PATTERN.test(err instanceof Error ? err.message : String(err))

export class AuthLockedError extends Error {
  constructor() {
    super(AUTH_LOCKED_MESSAGE)
    this.name = "AuthLockedError"
  }
}

/**
 * Take a slot for one attempt. Returns the window the slot is in, or
 * `undefined` when the key has no free slot. The check and the increment run
 * with no `await` between them, so concurrent callers cannot take one slot.
 */
const reserve = (key: string): AuthWindow | undefined => {
  const now = Date.now()
  let window = windows.get(key)
  if (!window || window.end <= now) {
    window = { count: 0, end: now + AUTH_FAILURE_WINDOW_MS }
    windows.set(key, window)
  }
  if (window.count >= AUTH_FAILURE_LIMIT) return undefined
  window.count++
  return window
}

/**
 * Give back a slot, but only to the window it was taken from. When that window
 * has ended, the key has a new window that the slot is not part of.
 */
const release = (key: string, window: AuthWindow): void => {
  if (windows.get(key) === window && window.count > 0) window.count--
}

/**
 * Run `fn`, which authenticates with the credentials in `details`. Throws
 * `AuthLockedError` without calling `fn` when every slot of the key is taken
 * by failures or by attempts in progress. An attempt that fails with an
 * authentication error keeps its slot until the window ends. Any other result
 * gives the slot back.
 */
export async function withAuthLimit<T>(details: IdentityDetails, endpoint: Endpoint, fn: () => Promise<T>): Promise<T> {
  const key = authLimitKey(details, endpoint)
  const window = reserve(key)
  if (!window) throw new AuthLockedError()
  let authFailed = false
  try {
    return await fn()
  } catch (err) {
    authFailed = isAuthError(err)
    throw err
  } finally {
    if (!authFailed) release(key, window)
  }
}
