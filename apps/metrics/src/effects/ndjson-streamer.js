import fs from "node:fs"
import readline from "node:readline"
import path from "node:path"
import { COMMANDLOG_LARGE_REPLY, COMMANDLOG_LARGE_REQUEST, COMMANDLOG_SLOW, MONITOR } from "../utils/constants.js"

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data")

const dayStr = (date) => date.toISOString().slice(0, 10).replace(/-/g, "")

const fileFor = (prefix, date) => {
  const dataDir = DATA_DIR
  return path.join(dataDir, `${prefix}_${dayStr(date)}.ndjson`)
}

export async function streamNdjson(prefix,{ filterFn = () => true, limit = Infinity } = {}) {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  const files = [fileFor(prefix, yesterday), fileFor(prefix, today)]

  const results = []
  let count = 0

  for (const file of files) {
    if (!fs.existsSync(file)) continue
    const fileStream = fs.createReadStream(file, { encoding: "utf8" })
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity })

    for await (const line of rl) {
      if (count >= limit) {
        rl.close()
        fileStream.destroy()
        break
      }
      if (!line.trim()) continue
      try {
        const obj = JSON.parse(line)
        if (filterFn(obj)){
          results.push(obj)
          count++
        }  
       
      } catch {
        // ignore bad lines
      }
    }
  }

  return results // JSON array of all objects
}

export const [memory_stats, info_cpu, slowlog_len, commandlog_slow, commandlog_large_reply, commandlog_large_request, monitor] =
  // eslint-disable-next-line max-len
  ["memory", "cpu", "slowlog_len", COMMANDLOG_SLOW, COMMANDLOG_LARGE_REPLY, COMMANDLOG_LARGE_REQUEST, MONITOR].map((filePrefix) => (options = {}) => streamNdjson(filePrefix, options))
