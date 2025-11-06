import path from "node:path"
import { readdir, readFile } from "node:fs/promises"

const DATA_DIR = process.env.METRICS_DIR || path.resolve(process.cwd(), "data")

const ymd = d => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}` // "20251106"
}

// Return all files matching prefix_YYYYMMDD*.ndjson
const filesForDate = async (prefix, date) => {
  const dateStr = ymd(date)
  const dirFiles = await readdir(DATA_DIR)
  return dirFiles
    .filter(f => f.startsWith(`${prefix}_${dateStr}`) && f.endsWith(".ndjson"))
    .map(f => path.join(DATA_DIR, f))
}

// read file text or "" (ENOENT-safe)
const readText = async file => {
  try {
    return await readFile(file, "utf8")
  } catch (e) {
    return e?.code === "ENOENT" ? "" : Promise.reject(e)
  }
}

// Read + merge all files for a date
const readAllFilesForDate = async (prefix, date) => {
  const files = await filesForDate(prefix, date)
  const contents = await Promise.all(files.map(readText))
  return contents.join("\n")
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
    readAllFilesForDate(prefix, today),
    readAllFilesForDate(prefix, yesterday)
  ])

  return parseNdjson([t, y].filter(Boolean).join('\n'))
}

// Reader API to match express public API
export const [memory_stats, info_cpu, slowlog_len, slowlog_get, monitor] =
  ['memory', 'cpu', 'slowlog_len', 'slowlog', 'monitor'].map(filePrefix => () => readTwoDaysRows(filePrefix))