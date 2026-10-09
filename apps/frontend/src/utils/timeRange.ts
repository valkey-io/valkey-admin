import { MILLISECONDS_IN_AN_HOUR, MILLISECONDS_IN_A_DAY } from "@common/src/constants"

export type TimeRangeUnit = "h" | "d"

export type TimeRange = { amount: number; unit: TimeRangeUnit }

export const TIME_RANGE_LIMITS: Record<TimeRangeUnit, { min: number; max: number }> = {
  h: { min: 1, max: 720 },
  d: { min: 1, max: 30 },
}

export const timeRangeToMs = ({ amount, unit }: TimeRange): number =>
  amount * (unit === "h" ? MILLISECONDS_IN_AN_HOUR : MILLISECONDS_IN_A_DAY)
