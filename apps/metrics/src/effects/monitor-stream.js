import {Subject, timer, race, firstValueFrom, defer, of} from "rxjs"
import { exhaustMap, catchError, map } from "rxjs" 
import Valkey from "iovalkey"

export const makeMonitorStream = (onLogs = async () => {}, config) => {
  const { monitoringInterval, monitoringDuration, maxCommandsPerRun: maxLogs } = config
  //URL hardcoded for testing 
  const url = String(process.env.VALKEY_URL || config.valkey.url || "valkey://host.docker.internal:6379" ).trim()


  const runMonitorOnce = async () => {
    const monitorClient = new Valkey(url)
    const monitor = await monitorClient.monitor()
    
    const rows = []
    const overflow$ = new Subject()
    
    const processEvent = (time, args) => {
      rows.push({ts: time, command: args.join(" ")})
      if (rows.length >= maxLogs) overflow$.next()
    }

    monitor.on("monitor", processEvent)

    let monitorCompletionReason

    try {
      monitorCompletionReason = await firstValueFrom(
        race([
          timer(monitoringDuration).pipe(map(() => "Monitor duration completed.")),
          overflow$.pipe(map(() => "Max logs read" )),
        ])
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
        catchError(err => {
          console.error("Monitor cycle failed", err)
          return of([])
        })
      )
    )
  )
  return monitorStream$

}
