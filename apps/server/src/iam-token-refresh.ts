import { GlideClient, GlideClusterClient, ClosingError } from "@valkey/valkey-glide"
import { mintGcpAccessToken } from "./gcp-iam-provider"

// GCP OAuth2 access tokens live ~1 hour. Glide keeps existing connections
// authenticated after expiry, but new/reconnecting connections need a fresh
// token, so we re-mint and push it to every node connection well before expiry.
const REFRESH_INTERVAL_MS = 45 * 60 * 1000

type RefreshableClient = GlideClient | GlideClusterClient

const refreshTimers = new Map<RefreshableClient, NodeJS.Timeout>()

// Rotate the connection password for a gcp-iam client on a timer. 
// Keyed by the client instance so shared cluster clients are only scheduled once; the timer
// self-clears once the client is closed (updateConnectionPassword throws ClosingError),
// so callers do not have to unregister at every close site.
export function registerGcpTokenRefresh(client: RefreshableClient, label: string): void {
  if (refreshTimers.has(client)) return

  const timer = setInterval(async () => {
    try {
      const token = await mintGcpAccessToken()
      await client.updateConnectionPassword(token, true)
    } catch (error) {
      if (error instanceof ClosingError) {
        unregisterGcpTokenRefresh(client)
        return
      }
      console.error(`Error refreshing GCP IAM token for ${label}:`, error)
    }
  }, REFRESH_INTERVAL_MS)

  // Do not keep the process alive solely for the refresh timer.
  timer.unref?.()
  refreshTimers.set(client, timer)
}

export function unregisterGcpTokenRefresh(client: RefreshableClient): void {
  const timer = refreshTimers.get(client)
  if (timer) {
    clearInterval(timer)
    refreshTimers.delete(client)
  }
}
