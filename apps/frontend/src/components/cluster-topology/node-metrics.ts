export function formatRate(value: number): string {
  return `${Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)}/s`
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—"
  return `${value.toFixed(1)}%`
}
