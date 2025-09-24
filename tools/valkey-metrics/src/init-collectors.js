import { makeFetcher } from "./effects/fetchers.js"
import { makeNdjsonWriter } from "./effects/ndjson-writer.js"
import { startCollector } from "./epics/collector-rx.js"
import { loadConfig } from "./config.js"

const cfg = loadConfig()

const setupCollectors = async client => {
  const fetcher = makeFetcher(client)

  const stoppers = {}

  // here we start data collection epics per each config with corresponding stat fetchers
  for (const f of cfg.epics) {
    const fn = fetcher[f.type]
    if (!fn) {
      console.warn(`unknown epic type ${f.type} for ${f.name}, skipping`)
      continue
    }

    const nd = makeNdjsonWriter({
      dataDir: cfg.server.data_dir,
      filePrefix: f.file_prefix || f.name
    })

    // write NDJSON files; if we need to ingest into memory for some reason — do it here
    const sink = {
      appendRows: async rows => {
        await nd.appendRows(rows)
      },
      close: nd.close
    }

    // collect the first values immediately
    try {
      const rows = await fn()
      await sink.appendRows(rows)
    } catch (e) {
      console.error(`[${f.name}] error`, e?.message || e)
    }

    // then start a corresponding epic to poll on `pollMs` interval
    stoppers[f.name] = startCollector({
      name: f.name,
      pollMs: f.poll_ms,
      fetch: fn,
      writer: sink,
      batchMs: cfg.collector.batch_ms,
      batchMax: cfg.collector.batch_max
    })
  }

  return stoppers
}

export { setupCollectors }