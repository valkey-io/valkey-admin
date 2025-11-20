import fs from "fs"
import path from "path"
import * as R from "ramda"

const dayStr = ts => new Date(ts).toISOString().slice(0, 10).replace(/-/g, "")

export const makeNdjsonWriter = ({ dataDir, filePrefix }) => {
  const fileFor = ts => path.join(dataDir, `${filePrefix}_${dayStr(ts, filePrefix)}.ndjson`)

  const appendRows = async (rows = []) => {
    if (R.isEmpty(rows.length)) return

    const ts = Number.isFinite(rows[0]?.ts) ? rows[0].ts : Date.now()
    const file = fileFor(ts)
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    const lines = rows.map(r => JSON.stringify(r)).join("\n").concat("\n")
    await fs.promises.appendFile(file, lines, "utf8")
  }

  const close = async () => {}

  return { appendRows, close }
}
