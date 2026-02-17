import { Subject, timer, race, firstValueFrom, defer, of } from "rxjs"
import { exhaustMap, catchError, map } from "rxjs"
import Valkey from "iovalkey"

export const makeMonitorStream = (onLogs = async () => { }, config) => {
  const { monitoringInterval, monitoringDuration, maxCommandsPerRun: maxLogs } = config

  const host = process.env.VALKEY_HOST
  const port = Number(process.env.VALKEY_PORT)

  const username = process.env.VALKEY_USERNAME
  const password = process.env.VALKEY_PASSWORD
  const verifyTlsCertificate  = process.env.VALKEY_VERIFY_CERT
  let tls = undefined
  if (process.env.VALKEY_TLS === "true") {
    tls = verifyTlsCertificate === "false" ? { rejectUnauthorized: false } :  {}
  }

  const runMonitorOnce = async () => {
    const monitorClient = new Valkey({
      host,
      port, 
      username,
      password,
      tls,
    })
    const monitor = await monitorClient.monitor()

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
        monitorClient.disconnect(),
        (async () => { overflow$.complete() })(),
      ])
      console.info(`Monitor run complete (${monitorCompletionReason}).`)
    }

    if (rows.length > 0) await onLogs(rows)
    return rows
  }
  const monitorStream$ = timer(0, monitoringInterval).pipe(
    exhaustMap(() =>
      defer(runMonitorOnce).pipe(
        catchError((err) => {
          console.error("Monitor cycle failed", err)
          return of([])
        }),
      ),
    ),
  )
  return monitorStream$

}
