import { formatBytes } from "./bytes-conversion.js"
import { formatSeconds } from "./time-utils.js"

export type ValueType = "bytes" | "number" | "mixed"

export const formatMetricValue = (
  key: string,
  value: number | null,
  valueType: ValueType = "number",
): string => {
  if (value === null || value === undefined) return "N/A"

  if (valueType === "bytes") {
    return formatBytes(value)
  }

  if (valueType === "mixed") {
    const byteKeys = ["total_net_input_bytes", "total_net_output_bytes"]
    const secondKeys = ["uptime_in_seconds"]

    if (byteKeys.includes(key)) {
      return formatBytes(value)
    }

    if (secondKeys.includes(key)) {
      return formatSeconds(value)
    }
  }

  return typeof value === "number" ? value.toLocaleString() : String(value)
}
