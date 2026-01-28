import { Deps, withDeps } from "./actions/utils"
type HealthStatus = "up" | "down" | "connecting"

interface HealthResponse {
  status: HealthStatus
}

let lastHealth: HealthResponse | null = null

const POLL_MS = 1500

export const checkHealth = withDeps<Deps, void>(
  async ({ ws, metricsServerURIs, action }) => {
    const { connectionId } = action.payload
    
    const metricsServerURI = metricsServerURIs.get(connectionId)
    setInterval(async () => {
      try {
        const res = await fetch(`${metricsServerURI}/health`)

        if (!res.ok) {
          throw new Error(`health check failed: ${res.status}`)
        }

        const health = (await res.json()) as HealthResponse

        if (health.status !== lastHealth?.status) {
          lastHealth = health
          //Send action back accordingly
        }
      } catch {
        const health: HealthResponse = { status: "down" }

        if (health.status !== lastHealth?.status) {
          lastHealth = health
          //Send action back accordingly
        }
      }
    }, POLL_MS)

  })
