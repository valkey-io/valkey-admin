const fmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,      // ensures 24h
})

export const formatTimestamp = (ts: number): string => fmt.format(new Date(ts))
