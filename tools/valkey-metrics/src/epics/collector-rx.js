import { timer, defer, EMPTY } from "rxjs"
import { exhaustMap, bufferTime, filter, concatMap, catchError, mergeMap, tap, retry } from "rxjs/operators"
import * as R from "ramda"
import { createLogger } from "../utils/logger.js"

const log = createLogger("collector-rx")

// exponential backoff for connection issues. well, for all issues — we don't do it based on the error. should we?
const backoffDelay = (baseMs = 1000, maxMs = 16000) => (err, retryCount) => {
  const cap = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, retryCount - 1)))
  const ms = Math.floor(Math.random() * cap)
  log.warn(`retry in ${ms}ms: ${err?.message || err}`)
  return timer(ms)
}

export const startCollector = ({ name, pollMs, fetch, writer, batchMs, batchMax }) => {
  const pipeline$ = timer(0, pollMs).pipe(
    // exhaustMap doesn't run another fetch() if previous fetch took longer than pollMs
    // which may happen on a connectivity issue, so we won't DDoS our own instance with slow network, and we don't
    // want to (we really can't) cancel the previous fetch, so switchMap is as bad of a choice as concatMap
    exhaustMap(() =>
      defer(() => fetch()).pipe(
        retry({ delay: backoffDelay() }),
        catchError(err => {
          log.error(`[${name}] fetch error`, err?.message || err)
          return EMPTY
        })
      )
    ),
    mergeMap(rows => Array.isArray(rows) ? rows : []), // am I too defensive? it should be an array. right?
    bufferTime(batchMs, null, batchMax), // batch rows
    filter(R.isNotEmpty),
    tap(batch => {
      // tap is only for SYNC side effects, so don't write into files here! use concatMap below
      log.debug(`[${name}] write ${batch.length} rows`)
    }),
    concatMap(batch => writer.appendRows(batch)) // sequential writes
  )

  const sub = pipeline$.subscribe({
    error: e => log.error(`[${name}] stream error`, e)
  })

  return () => sub.unsubscribe()
}
