// Chart axis/tooltip labels: include the date when a chart spans multiple days so points from different days are distinguishable.
export const chartTimestampFormatter = (withDate: boolean) => (ts: unknown): string => {
  if (!ts) return ""
  const date = new Date(Number(ts))
  return withDate
    ? date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : date.toLocaleTimeString()
}
