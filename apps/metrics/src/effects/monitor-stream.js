import { Subject, timer, race, firstValueFrom, defer, of } from "rxjs"
import { exhaustMap, catchError, map } from "rxjs"
import Valkey from "iovalkey"
import { readFileSync } from "node:fs"
import { ElastiCacheIAMProvider } from "../utils/elasticache-iam-provider.js"
import { GcpIAMProvider } from "../utils/gcp-iam-provider.js"

function getConnectionOptions() {
  const host = process.env.VALKEY_HOST
  const port = Number(process.env.VALKEY_PORT)
  const username = process.env.VALKEY_USERNAME
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
    return await new GcpIAMProvider().getCredentials()
  }
  return process.env.VALKEY_PASSWORD
}

/**
 * Phase 1: Connect and issue MONITOR command.
 * Returns the client and monitor handle for use in Phase 2.
 * Throws immediately if the command is unsupported.
 */
export const connectMonitor = async () => {
  const { host, port, username, tls } = getConnectionOptions()
  const password = await getPassword()
  const client = new Valkey({ host, port, username, password, tls })
  client.on("error", (err) => console.error("[monitor] iovalkey client error:", err.message))
  const monitor = await client.monitor()
  monitor.on("error", (err) => console.error("[monitor] monitor stream error:", err.message))
  return { client, monitor }
}

/**
 * Phase 2: Collect logs from an active monitor handle.
 * Listens for monitoringDuration or until maxLogs is reached, then disconnects.
 */
export const collectLogs = async ({ client, monitor }, { monitoringDuration, maxCommandsPerRun: maxLogs }) => {
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
      client.disconnect(),
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
