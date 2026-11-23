// Retries for tool calls that reach a metrics collector before it has started,
// which happens on the first call after Valkey Admin connects to a node.
import { setTimeout as sleep } from "node:timers/promises"

const NOT_READY_RETRIES = 5
const NOT_READY_DELAY_MS = 1000

export const METRICS_NOT_STARTED = "Metrics server not started"

// Thrown when the collector is not running yet, so the call can be retried.
export class NotReadyError extends Error {}

// Runs load, retrying once a second while it throws NotReadyError, up to
// NOT_READY_RETRIES attempts. Other errors are thrown at once.
export const retryWhileNotReady = async <T>(load: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load()
    } catch (error) {
      if (!(error instanceof NotReadyError) || attempt === NOT_READY_RETRIES) throw error
      await sleep(NOT_READY_DELAY_MS)
    }
  }
}
