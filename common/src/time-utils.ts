const fmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,      // ensures 24h
})

export const formatTimestamp = (ts: number): string => fmt.format(new Date(ts))

// returns time ago in appropriate units like "24s" or "8m 24s" or "8h 24m"
export const timeAgo = (timestamp: number): string => {
  const now = Date.now()
  const diff = Math.max(0, Math.floor((now - timestamp) / 1000)) // total seconds

  if (diff < 60)
    return `${diff}s`

  const m = Math.floor(diff / 60)
  const s = diff % 60
  if (diff < 3600)
    return s ? `${m}m ${s}s` : `${m}m`

  const h = Math.floor(diff / 3600)
  const remM = Math.floor((diff % 3600) / 60)
  if (diff < 86400)
    return remM ? `${h}h ${remM}m` : `${h}h`

  const d = Math.floor(diff / 86400)
  const remH = Math.floor((diff % 86400) / 3600)
  const remM2 = Math.floor((diff % 3600) / 60)
  if (remH && remM2) return `${d}d ${remH}h ${remM2}m`
  if (remH) return `${d}d ${remH}h`
  if (remM2) return `${d}d ${remM2}m`
  return `${d}d`
}
