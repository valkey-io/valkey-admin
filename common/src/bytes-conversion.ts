export function formatBytes(bytes: number) {
  if (bytes < 0) return "—"
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"]
  // Clamp so values past the largest unit (and fractions of a byte) still get a unit.
  const i = Math.min(Math.max(Math.floor(Math.log(bytes) / Math.log(k)), 0), sizes.length - 1)
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2))
  return `${value} ${sizes[i]}`
}
