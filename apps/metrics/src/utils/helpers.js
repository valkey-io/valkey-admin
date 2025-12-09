export const ymd = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}${m}${day}` // "20250924"
}

export const parseCommandLogs = (entries, commandLogType) =>
  entries.map(([
    id,
    tsSec,
    metricValue,     // duration or size
    argv = [],
    addr = "unknown",
    name = "unknown",
  ] = []) => ({
    id: String(id),
    ts: Number(tsSec) * 1000,
    ...(commandLogType === "slow"
      ? { duration_us: Number(metricValue) }
      : { size: Number(metricValue) }),
    argv: Array.isArray(argv) ? argv.map(String) : [],
    addr: String(addr),
    client: String(name),
  }))
