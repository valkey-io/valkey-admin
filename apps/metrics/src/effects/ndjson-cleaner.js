import fs from "node:fs"
import path from "node:path"
import { timer } from "rxjs"
import { exhaustMap } from "rxjs/operators"
import { METRICS_EVICTION_POLICY, MILLISECONDS_IN_A_DAY } from "../../../../common/src/constants.js"
import { createLogger } from "../utils/logger.js"

const log = createLogger("ndjson-cleaner")

let cleanerStopper

const retentionForFile = (fileName, retentionByPrefix) => {
  for (const [prefix, days] of retentionByPrefix) {
    if (fileName.startsWith(`${prefix}_`)) return days
  }
  return -1
}

export const setupNdjsonCleaner = ( cfg ) => {
  const retentionByPrefix = cfg.epics.map((e) => [e.file_prefix || e.name, e.data_retention_days])

  const pipeline$ = timer(0, METRICS_EVICTION_POLICY.INTERVAL).pipe(
    exhaustMap(() => 
      fs.promises.readdir(cfg.server.data_dir) // get file names from directory
        .then((fileNames) => fileNames.filter((f) => f.endsWith(".ndjson")))
        // get file stats for each file
        .then((fileNames) => Promise.all(fileNames.map(
          async (fileName) => ({ stats: await fs.promises.stat(path.join(cfg.server.data_dir, fileName)), fileName }),
        )))
        // filter out files that are expired based on their epic's retention
        .then((filesWithStats) => filesWithStats.reduce((acc, { stats, fileName }) => {
          const days = retentionForFile(fileName, retentionByPrefix)
          if (days >= 0 && stats.birthtime < Date.now() - days * MILLISECONDS_IN_A_DAY) acc.push(fileName)
          return acc
        }, []))
        // delete expired files
        .then(async (expiredFileNames) => (await Promise.allSettled(expiredFileNames.map(
          (fileName) => fs.promises.unlink(path.join(cfg.server.data_dir, fileName)),
        )))
          .forEach((result, i) => {
            if (result.status === "rejected") log.error(result.reason, `Failed to delete: ${expiredFileNames[i]}`)
          }))
        .catch((err) => { log.error(err) }),
    ),
  )
  
  const sub = pipeline$.subscribe({
    error: (e) => log.error(e),
  })
  
  cleanerStopper = () => sub.unsubscribe()
}

export const stopNdjsonCleaner = () => {
  if (cleanerStopper) {
    cleanerStopper()
  }
}
