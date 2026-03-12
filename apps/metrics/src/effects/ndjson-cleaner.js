import fs from "node:fs"
import path from "node:path"
import { timer } from "rxjs"
import { exhaustMap } from "rxjs/operators"
import { METRICS_EVICTION_POLICY, MILLISECONDS_IN_A_DAY } from "../../../../common/src/constants.js"
import { createLogger } from "../utils/logger.js"

const log = createLogger("ndjson-cleaner")

let cleanerStopper

export const setupNdjsonCleaner = ( cfg ) => {
  const pipeline$ = timer(0, METRICS_EVICTION_POLICY.INTERVAL).pipe(
    exhaustMap(() => 
      scanDir(cfg.server.data_dir)
        .then((files) => applyRetentionPolicy(files, cfg.storage.retention_days))
        .then((expired) => deleteFiles(cfg.server.data_dir, expired)),
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

const scanDir = async (dir) => {
  const fileNames = await fs.promises.readdir(dir)
  return fileNames
}

const applyRetentionPolicy = (fileNames, retentionDays) => {
  const cutoff = Date.now() - retentionDays * MILLISECONDS_IN_A_DAY
  const expired = fileNames.filter((fileName) => {
    if (!fileName.endsWith(".ndjson")) return false
    const match = fileName.match(/_(\d{8})\.ndjson$/)
    if (!match) return false
    const [y, m, d] = [match[1].slice(0, 4), match[1].slice(4, 6), match[1].slice(6, 8)]
    // Month uses month index instead of month number
    return new Date(y, m - 1, d).getTime() < cutoff
  })
  return expired
}

const deleteFiles = async (dir, fileNames) => {
  await Promise.all(fileNames.map((fileName) => fs.promises.unlink(path.join(dir, fileName))))
}
