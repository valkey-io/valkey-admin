import { makeFetcher } from "./effects/fetchers.js"
import { makeMonitorStream } from "./effects/monitor-stream.js"
import { makeNdjsonWriter } from "./effects/ndjson-writer.js"
import { startCollector } from "./epics/collector-rx.js"
import { MONITOR } from "./utils/constants.js"
/*
  State per collector with shape:
  {
    isRunning: boolean,
    lastUpdatedAt: timestamp,
    nextCycleAt: timestamp, // Calculated only for collectors, not the monitor as the monitor is controlled manually
  }
*/
const collectorsState = {}

const updateCollectorMeta = (name, patch) => {
  const prev = collectorsState[name] || {}
  const next = { ...prev, ...patch }
  collectorsState[name] = next
  return next
}

// Use it in endpoints to return metadata to server then to UI to show when the data was collected and will be refreshed
export const getCollectorMeta = (name) => collectorsState[name]
const stoppers = {}

updateCollectorMeta(MONITOR, {
  isRunning: false,
}) 
const startMonitor = (cfg) => {
  const nd = makeNdjsonWriter({
    dataDir: cfg.server.data_dir,
    filePrefix: MONITOR,
  })

  const monitorEpic = cfg.epics.find((e) => e.name === MONITOR)

  const sink = {
    appendRows: async (rows) => {
      await nd.appendRows(rows)
      console.info(`[${monitorEpic.name}] wrote ${rows.length} logs to ${cfg.server.data_dir}/`)
    },
    close: nd.close,
  }

  updateCollectorMeta(monitorEpic.name, {
    isRunning: true,
    startedAt: Date.now(),
    willCompleteAt: Date.now() + monitorEpic.monitoringDuration,
  })

  const stream$ = makeMonitorStream(async (logs) => {
    await sink.appendRows(logs)
  }, monitorEpic)

  const subscription = stream$.subscribe({
    next: (logs) => {
      updateCollectorMeta(monitorEpic.name, {
        lastUpdatedAt: Date.now(),
      })
      console.info(`[${monitorEpic.name}] monitor cycle complete (${logs.length} logs)`)
    },
    error: (err) => {
      updateCollectorMeta(monitorEpic.name, {
        isRunning: false,
        lastErrorAt: Date.now(),
        lastError: String(err),
        willCompleteAt: null,
      })
      console.error(`[${monitorEpic.name}] monitor error:`, err)
    },
    complete: () => {
      updateCollectorMeta(monitorEpic.name, {
        completedAt: Date.now(),
        isRunning: false,
      })
      console.info(`[${monitorEpic.name}] monitor completed`)
    },
  })

  stoppers[monitorEpic.name] = async () => {
    console.info(`[${monitorEpic.name}] stopping monitor...`)
    updateCollectorMeta(monitorEpic.name, {
      stoppedAt: Date.now(),
      isRunning: false,
      willCompleteAt: null,
    })
    subscription.unsubscribe()
    await sink.close()
  }
}

const stopMonitor = async () => await stoppers[MONITOR]()

const setupCollectors = async (client, cfg) => {
  const fetcher = makeFetcher(client)
  const stoppers = {}
  await Promise.all(cfg.epics
    .filter((f) => f.name !== MONITOR && fetcher[f.type])
    .map(async (f) => {
      const fn = fetcher[f.type]
      const nd = makeNdjsonWriter({
        dataDir: cfg.server.data_dir,
        filePrefix: f.file_prefix || f.name,
      })

      updateCollectorMeta(f.name, {
        isRunning: true,
        lastUpdatedAt: null,
        nextCycleAt: Date.now() + f.poll_ms,
        startedAt: Date.now(),
      })

      const sink = {
        appendRows: async (rows) => {
          nd.appendRows(rows)
          updateCollectorMeta(f.name, {
            nextCycleAt: Date.now() + f.poll_ms,
            lastUpdatedAt: Date.now(),
          })
        },
        close: () => {
          updateCollectorMeta(f.name, {
            isRunning: false,
            nextCycleAt: null,
            stoppedAt: Date.now(),
          })
          nd.close()
        },
      }

      const rows = await fn()

      await sink.appendRows(rows)
      stoppers[f.name] = startCollector({
        name: f.name,
        pollMs: f.poll_ms,
        fetch: fn,
        writer: sink,
        batchMs: cfg.collector.batch_ms,
        batchMax: cfg.collector.batch_max,
      })
    }),
  )
  return stoppers
}

export { setupCollectors, startMonitor, stopMonitor }
