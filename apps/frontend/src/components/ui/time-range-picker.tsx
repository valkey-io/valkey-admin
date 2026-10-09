import { useCallback, useEffect, useState } from "react"
import { NumberInput } from "./number-input"
import { Select } from "./select"
import { Typography } from "./typography"
import { chartTimestampFormatter } from "@/utils/chartTimestampFormatter"
import { TIME_RANGE_LIMITS, timeRangeToMs, type TimeRange, type TimeRangeUnit } from "@/utils/timeRange"

// loading time for range picker to commit changes after user stops typing
const COMMIT_DELAY_MS = 600
// Show "Data available since" only when data covers under 90% of the range; the margin absorbs normal collection lag.
const MIN_COVERAGE_RATIO = 0.9
const formatWithDate = chartTimestampFormatter(true)

const UNIT_OPTIONS: Array<{ value: TimeRangeUnit; label: string }> = [
  { value: "h", label: "Hour" },
  { value: "d", label: "Day" },
]

interface TimeRangePickerProps {
  value: TimeRange
  onChange: (value: TimeRange) => void
  data?: Array<{ timestamp: number }>
}

// Clamps the amount to the min/max for the given unit, rounding to nearest integer.
const clampAmount = (amount: number, unit: TimeRangeUnit): number =>
  Math.min(TIME_RANGE_LIMITS[unit].max, Math.max(TIME_RANGE_LIMITS[unit].min, Math.round(amount)))

// Returns when the data starts, or null if it covers enough of the selected range.
const dataStartIfIncomplete = (data: Array<{ timestamp: number }> | undefined, rangeMs: number): number | null => {
  if (!data || data.length < 2) return null
  const start = data[0].timestamp
  return data[data.length - 1].timestamp - start < rangeMs * MIN_COVERAGE_RATIO ? start : null
}

export function TimeRangePicker({ value, onChange, data }: TimeRangePickerProps) {
  const { amount, unit } = value
  const availableSince = dataStartIfIncomplete(data, timeRangeToMs(value))
  const [draftAmount, setDraftAmount] = useState<number | null>(amount)

  useEffect(() => {
    setDraftAmount(amount)
  }, [amount])

  const commit = useCallback((nextAmount: number | null, nextUnit: TimeRangeUnit) => {
    const clamped = clampAmount(nextAmount ?? amount, nextUnit)
    setDraftAmount(clamped)
    if (clamped !== amount || nextUnit !== unit) onChange({ amount: clamped, unit: nextUnit })
  }, [amount, unit, onChange])

  useEffect(() => {
    if (draftAmount === null || draftAmount === amount) return
    const timer = setTimeout(() => commit(draftAmount, unit), COMMIT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draftAmount, amount, unit, commit])

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        className="flex items-center gap-2"
        onBlur={() => commit(draftAmount, unit)}
        onSubmit={(e) => {
          e.preventDefault()
          commit(draftAmount, unit)
        }}
      >
        <span className="text-sm text-muted-foreground">Last</span>
        <NumberInput
          allowEmpty
          aria-label="Time range amount"
          className="h-9"
          max={TIME_RANGE_LIMITS[unit].max}
          min={TIME_RANGE_LIMITS[unit].min}
          onChange={setDraftAmount}
          style={{ width: "72px" }}
          value={draftAmount}
        />
        <Select
          aria-label="Time range unit"
          className="h-9 w-24"
          onChange={(e) => commit(draftAmount, e.target.value as TimeRangeUnit)}
          value={unit}
        >
          {UNIT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {draftAmount === 1 ? option.label : `${option.label}s`}
            </option>
          ))}
        </Select>
      </form>
      {availableSince !== null && (
        <Typography variant="bodyXs">
          Data available since {formatWithDate(availableSince)}
        </Typography>
      )}
    </div>
  )
}
