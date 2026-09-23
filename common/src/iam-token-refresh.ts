import { retryDelay } from "./constants"
import { mintGcpAccessToken } from "./gcp-iam-provider"

// Structural type so this module does not depend on @valkey/valkey-glide.
// Glide's GlideClient / GlideClusterClient satisfy it (their
// updateConnectionPassword returns a GlideString, which we ignore).
export interface RefreshableClient {
  updateConnectionPassword(password: string, immediateAuth: boolean): Promise<unknown>
}

// GCP OAuth2 access tokens live ~1 hour. Glide keeps existing connections
// authenticated after expiry, but new/reconnecting connections need a fresh
// token, so we re-mint and push it to every node connection well before expiry.
const REFRESH_INTERVAL_MS = 45 * 60 * 1000

interface RefreshState {
  label: string
  useTLS: boolean
  verifyTlsCertificate: boolean
  timer?: NodeJS.Timeout // the next scheduled refresh (regular cadence or backoff retry)
  failures: number // 0 while healthy; drives exponential backoff while failing
}

const refreshStates = new Map<RefreshableClient, RefreshState>()

// Glide throws ClosingError once the client is closed; its `name` getter returns
// the constructor name, so we detect it without importing @valkey/valkey-glide.
function isClosingError(error: unknown): boolean {
  return error instanceof Error && error.name === "ClosingError"
}

function scheduleNext(client: RefreshableClient, delayMs: number): void {
  const state = refreshStates.get(client)
  if (!state) return
  if (state.timer) clearTimeout(state.timer)
  const timer = setTimeout(() => {
    void refresh(client)
  }, delayMs)
  // Do not keep the process alive solely for the refresh timer.
  timer.unref?.()
  state.timer = timer
}

async function refresh(client: RefreshableClient): Promise<void> {
  const state = refreshStates.get(client)
  if (!state) return
  try {
    const token = await mintGcpAccessToken(state.useTLS, state.verifyTlsCertificate)
    await client.updateConnectionPassword(token, true)
    state.failures = 0
    scheduleNext(client, REFRESH_INTERVAL_MS)
  } catch (error) {
    if (isClosingError(error)) {
      unregisterGcpTokenRefresh(client)
      return
    }
    state.failures += 1
    console.error(`Error refreshing GCP IAM token for ${state.label}:`, error)
    // Back off (fibonacci) but never wait longer than the regular interval, so a
    // fresh token still lands before the ~1h token expires. A later success
    // resets `failures` and restores the regular cadence.
    scheduleNext(client, Math.min(retryDelay(state.failures), REFRESH_INTERVAL_MS))
  }
}

// Rotate the connection password for a gcp-iam client on a timer.
// Keyed by the client instance so shared cluster clients are only scheduled once; the timer
// self-clears once the client is closed (updateConnectionPassword throws ClosingError),
// so callers do not have to unregister at every close site.
export function registerGcpTokenRefresh(
  client: RefreshableClient,
  label: string,
  useTLS: boolean,
  verifyTlsCertificate: boolean,
): void {
  if (refreshStates.has(client)) return
  refreshStates.set(client, { label, useTLS, verifyTlsCertificate, failures: 0 })
  scheduleNext(client, REFRESH_INTERVAL_MS)
}

export function unregisterGcpTokenRefresh(client: RefreshableClient): void {
  const state = refreshStates.get(client)
  if (state?.timer) clearTimeout(state.timer)
  refreshStates.delete(client)
}
