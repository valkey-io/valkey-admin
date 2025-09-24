import path from "node:path"
import { readFile } from "node:fs/promises"

const DATA_DIR = process.env.METRICS_DIR || path.resolve(process.cwd(), "data")

const ymd = d => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}` // "20250924"
}

const fileFor = (prefix, date) => path.join(DATA_DIR, `${prefix}_${ymd(date)}.ndjson`)

// read file text or "" (ENOENT-safe)
const readText = async file => {
  try {
    return await readFile(file, "utf8")
  } catch (e) {
    return e?.code === "ENOENT" ? "" : Promise.reject(e)
  }
}

// parse once after concatenation; ignore any bad/partial line at the tail
const parseNdjson = txt =>
  txt.split(/\r?\n/)
     .filter(Boolean) // sometimes, "" == false is a feature, not a bug
     .map(line => { try { return JSON.parse(line) } catch { return null } })
     .filter(Boolean)

// today's rows, then yesterday's rows appended (not sorting anything as they are monotonically appended anyway)
const readTwoDaysRows = async prefix => {
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)

  const [t, y] = await Promise.all([
    readText(fileFor(prefix, today)),
    readText(fileFor(prefix, yesterday))
  ])

  return parseNdjson([t, y].filter(Boolean).join('\n'))
}

// Reader API to match express public API
export const [memory_stats, info_cpu, slowlog_len, slowlog_get] =
  ['memory', 'cpu', 'slowlog_len', 'slowlog'].map(filePrefix => () => readTwoDaysRows(filePrefix))