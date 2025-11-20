import { makeFetcher } from "./effects/fetchers.js"
import { makeMonitorStream } from "./effects/monitor-stream.js"
import { makeNdjsonWriter } from "./effects/ndjson-writer.js"
import { startCollector } from "./epics/collector-rx.js"
import { loadConfig } from "./config.js"

const cfg = loadConfig()
const MONITOR = "monitor"
const stoppers = {}

const startMonitor = () => {
  const nd = makeNdjsonWriter({
    dataDir: cfg.server.data_dir,
    filePrefix: MONITOR
  })
  const monitorEpic = cfg.epics.find(e => e.name === MONITOR)
  const sink = {
    appendRows: async rows => {
      await nd.appendRows(rows)
      console.info(`[${monitorEpic.name}] wrote ${rows.length} logs to ${cfg.server.data_dir}/${monitorEpic.file_prefix || monitorEpic.name}`)
    },
    close: nd.close
  }
  const stream$ = makeMonitorStream(async logs => {
    await sink.appendRows(logs)
  }, monitorEpic)
  const subscription = stream$.subscribe({
    next: logs => console.info(`[${monitorEpic.name}] monitor cycle complete (${logs.length} logs)`),
    error: err => console.error(`[${monitorEpic.name}] monitor error:`, err),
    complete: () => console.info(`[${monitorEpic.name}] monitor completed`),
  })
  stoppers[monitorEpic.name] = async () => {
    console.info(`[${monitorEpic.name}] stopping monitor...`)
    subscription.unsubscribe()
    await sink.close()
  }
}

const stopMonitor = async () => await stoppers[MONITOR]()

const setupCollectors = async client => {
  const fetcher = makeFetcher(client)
  const stoppers = {}
  await Promise.all(cfg.epics
    .filter(f => f.name !== MONITOR && fetcher[f.type])
    .map(async f => {
      const fn = fetcher[f.type]
      const nd = makeNdjsonWriter({
        dataDir: cfg.server.data_dir,
        filePrefix: f.file_prefix || f.name
      })
      const sink = {
        appendRows: async rows => nd.appendRows(rows),
        close: nd.close
      }
      const rows = await fn()
      await sink.appendRows(rows)
      stoppers[f.name] = startCollector({
        name: f.name,
        pollMs: f.poll_ms,
        fetch: fn,
        writer: sink,
        batchMs: cfg.collector.batch_ms,
        batchMax: cfg.collector.batch_max
      })
    })
  )
  return stoppers
}

export { setupCollectors, startMonitor, stopMonitor }
