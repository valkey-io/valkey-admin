export const ymd = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}` // "20250924"
}

export const parseCommandLogs = (entries) => {
  return entries.map((e = []) => {
    const [id, tsSec, durationUs, argv = [], addr = "unknown", name = "unknown"] = e
    return {
      id: String(id),
      ts: Number(tsSec) * 1000,
      duration_us: Number(durationUs),
      argv: Array.isArray(argv) ? argv.map(String) : [],
      addr: String(addr),
      client: String(name),
    }
  })
}
