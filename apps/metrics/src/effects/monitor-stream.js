import { Subject, timer, race, firstValueFrom, defer, of } from "rxjs"
import { exhaustMap, catchError, map } from "rxjs"
import Valkey from "iovalkey"
import { readFileSync } from "node:fs"
import { mintGcpAccessToken } from "valkey-common"
import { ElastiCacheIAMProvider } from "../utils/elasticache-iam-provider.js"

function getConnectionOptions() {
  const host = process.env.VALKEY_HOST
  const port = Number(process.env.VALKEY_PORT)
  // GCP IAM authenticates as the fixed "default" user; any other username is rejected.
  const username = process.env.VALKEY_AUTH_TYPE === "gcp-iam"
    ? "default"
    : process.env.VALKEY_USERNAME
  const verifyTlsCertificate = process.env.VALKEY_VERIFY_CERT
  let tls = undefined
  if (process.env.VALKEY_TLS === "true") {
    if (verifyTlsCertificate === "false") {
      tls = { rejectUnauthorized: false }
    } else if (process.env.VALKEY_CA_CERT_PATH) {
      tls = { ca: readFileSync(process.env.VALKEY_CA_CERT_PATH) }
    } else {
      tls = {}
    }
  }
  return { host, port, username, tls }
}

async function getPassword() {
  const username = process.env.VALKEY_USERNAME
  if (process.env.VALKEY_AUTH_TYPE === "iam") {
    return await new ElastiCacheIAMProvider(username, process.env.VALKEY_REPLICATION_GROUP_ID, process.env.VALKEY_AWS_REGION).getCredentials()
  }
  if (process.env.VALKEY_AUTH_TYPE === "gcp-iam") {
    return await mintGcpAccessToken(
      process.env.VALKEY_TLS === "true",
      process.env.VALKEY_VERIFY_CERT !== "false",
      process.env.VALKEY_CA_CERT_PATH,
    )
  }
  return process.env.VALKEY_PASSWORD
}

// iovalkey emits this when a reply arrives that no queued command is waiting for.
const QUEUE_STATE_ERROR = "Command queue state error"

/**
 * Phase 1: Connect and issue MONITOR command.
 * Returns the monitor handle for use in Phase 2.
 * Throws immediately if the command is unsupported or the connection fails.
 *
 * The connection is built directly with `monitor: true` instead of through
 * `client.monitor()`, so the error listener is attached before the socket
 * opens. iovalkey only switches to monitoring mode in a `.then()` after
 * MONITOR's OK, so monitor lines that arrive in the same socket read as the
 * OK are treated as unexpected replies and emitted as queue-state errors.
 * Without a listener already in place, the second of those errors is thrown
 * from the socket handler and kills the process. Those few lines are dropped.
 *
 * monitor-stream.race.test.js reproduces this against a real iovalkey
 * connection and a fake server that sends the OK and monitor lines in one write.
 */
export const connectMonitor = async () => {
  const { host, port, username, tls } = getConnectionOptions()
  const password = await getPassword()
  const monitor = new Valkey({ host, port, username, password, tls, monitor: true, lazyConnect: true })

  let monitoring = false
  const ready = new Promise((resolve, reject) => {
    monitor.on("error", (err) => {
      if (err.message?.startsWith(QUEUE_STATE_ERROR)) {
        console.warn("[monitor] dropped a line received before monitoring started")
        return
      }
      console.error("[monitor] monitor stream error:", err.message)
      // Before monitoring starts this is a connection failure or an unsupported MONITOR.
      if (!monitoring) reject(err)
    })
    monitor.once("monitoring", () => {
      monitoring = true
      resolve()
    })
  })

  try {
    // Promise.all keeps a late rejection from the slower promise handled.
    await Promise.all([monitor.connect(), ready])
  } catch (err) {
    monitor.disconnect()
    throw err
  }
  return { monitor }
}

/**
 * Phase 2: Collect logs from an active monitor handle.
 * Listens for monitoringDuration or until maxLogs is reached, then disconnects.
 */
export const collectLogs = async ({ monitor }, { monitoringDuration, maxCommandsPerRun: maxLogs }) => {
  const rows = []
  const overflow$ = new Subject()

  const processEvent = (time, args) => {
    rows.push({ ts: time, command: args.join(" ") })
    if (rows.length >= maxLogs) overflow$.next()
  }

  monitor.on("monitor", processEvent)

  let monitorCompletionReason

  try {
    monitorCompletionReason = await firstValueFrom(
      race([
        timer(monitoringDuration).pipe(map(() => "Monitor duration completed.")),
        overflow$.pipe(map(() => "Max logs read")),
      ]),
    )
  } finally {
    monitor.off("monitor", processEvent)
    await Promise.all([
      monitor.disconnect(),
      (async () => { overflow$.complete() })(),
    ])
    console.debug(`Monitor run complete (${monitorCompletionReason}).`)
  }

  return rows
}

export const makeMonitorStream = (onLogs = async () => { }, config) => {
  const { monitoringInterval } = config

  const runMonitorOnce = async () => {
    const handle = await connectMonitor()
    const rows = await collectLogs(handle, config)
    if (rows.length > 0) await onLogs(rows)
    return rows
  }

  const monitorStream$ = timer(0, monitoringInterval).pipe(
    exhaustMap(() =>
      defer(runMonitorOnce).pipe(
        catchError((err) => {
          console.error("Monitor cycle failed", err)
          if (err.message?.includes("unknown command")) {
            throw err
          }
          return of([])
        }),
      ),
    ),
  )
  return monitorStream$
}
