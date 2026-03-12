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
        .then((fileNames) => getFileStats(cfg.server.data_dir, fileNames))
        .then((filesWithStats) => applyRetentionPolicy(filesWithStats, cfg.storage.retention_days))
        .then((expired) => deleteFiles(cfg.server.data_dir, expired))
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

const scanDir = async (dir) => {
  const fileNames = await fs.promises.readdir(dir)
  return fileNames
}

const getFileStats = async (dir, fileNames) => {
  // fileNames are populated with readdir, only failure modes for stat are if the file is deleted & permissions changed between readdir and stat
  // Therefore using all instead of allSettled
  return Promise.all(fileNames.map(async (fileName) => [fileName, await fs.promises.stat(path.join(dir, fileName))]))
}

const applyRetentionPolicy = (filesWithStats, retentionDays) => {
  const expired = filesWithStats.filter(([fileName, stats]) => {
    if (!fileName.endsWith(".ndjson")) return false
    return stats.birthtime < Date.now() - retentionDays * MILLISECONDS_IN_A_DAY
  })
  return expired
}

const deleteFiles = async (dir, expiredFilesWithStats) => {
  (await Promise.allSettled(expiredFilesWithStats.map(([fileName]) => fs.promises.unlink(path.join(dir, fileName)))))
    .forEach((result, i) => {
      if (result.status === "rejected") log.error(result.reason, `Failed to delete: ${expiredFilesWithStats[i][0]}`)
    })
}
