import * as R from "ramda"
import { downsampleMinMaxOrdered } from "../utils/helpers.js"

// Valkey exposes CPU usage as cumulative counters:
//   `used_cpu_user`: time spent executing Valkey code in user space
//   `used_cpu_sys`: time spent in kernel space (syscalls, networking)
//
// These counters monotonically increase for the lifetime of the process.
// To display CPU usage over time, we sum them to get total CPU seconds
// at each timestamp, then compute deltas between consecutive timestamps.
// Dividing the CPU-time delta by wall-clock time yields "CPU cores used".

export const cpuSeed = {
  out: [],
  prevTs: null,
  prevTotal: 0,
  curTs: null,
  curTotal: null,
}

export const cpuFilter =
  ({ since, until } = {}) =>
    ({ ts, metric }) =>
      (metric === "used_cpu_sys" || metric === "used_cpu_user") &&
      (since == null || ts >= since) &&
      (until == null || ts <= until)

const shouldEmitPoint = ({ prevValue, currValue, tolerance = 0 }) =>
  tolerance === 0 ||
  prevValue == null || // first point
  (prevValue === 0 && currValue !== 0) || // went from zero to something
  (prevValue !== 0 && currValue === 0) || // went from something to zero
  (Math.abs((currValue - prevValue) / prevValue) > tolerance) // "noticeably" changed

/**
 * Adds CPU values for the current timestamp and emits when the timestamp changes (but see `tolerance` use as well).
 * Basically, we do all this logic because a line in the file can be either "used_cpu_sys" or "used_cpu_user".
 * To calculate one CPU usage value for a single timestamp, we need to read at least two lines to encounter both.
 * And to calculate a delta, we need two timestamps.
 * Emission can be suppressed using `tolerance`, which skips values close to
 * the previously emitted value (with special handling for zero).
 *
 * @param {{ tolerance?: number }} [options]
 * @param {number} [options.tolerance=0] Relative tolerance (0..1) for skipping values
 * @returns {(acc: {
 *   out: Array<{ timestamp: number, value: number }>,
 *   prevTs: number | null,
 *   prevTotal: number,
 *   curTs: number | null,
 *   curTotal: number | null
 * }, row: { ts: number, value: number }) => any}
 */
export const cpuReducer =
  ({ tolerance = 0 } = {}) =>
    (acc /*: cpuSeed */, { ts, value }) => {
      acc.curTs ??= ts
      acc.curTotal ??= 0

      if (ts !== acc.curTs) {
        if (acc.prevTs != null) {
          const wallSecondsElapsed = (acc.curTs - acc.prevTs) / 1000
          const cpuSecondsElapsed = acc.curTotal - acc.prevTotal

          if (wallSecondsElapsed > 0 && cpuSecondsElapsed >= 0) {
            const coresUsed = cpuSecondsElapsed / wallSecondsElapsed
            const prevValue = acc.out.at(-1)?.value

            if (shouldEmitPoint({ prevValue, currValue: coresUsed, tolerance })) {
              acc.out.push({ timestamp: acc.curTs, value: coresUsed })
            }
          }
        }

        // Move to the next bucket
        acc.prevTs = acc.curTs
        acc.prevTotal = acc.curTotal
        acc.curTs = ts
        acc.curTotal = 0
      }

      // Always add the current value to the active bucket
      acc.curTotal += value
      return acc
    }

// Emit the last value manually.
// Computing a delta needs two timestamps, and the reducer only emits on timestamp changes.
export const cpuFinalize =
  ({ tolerance = 0 } = {}) =>
    (acc) => {
      if (acc.prevTs == null || acc.curTs == null) return acc.out

      const wallSecondsElapsed = (acc.curTs - acc.prevTs) / 1000
      const cpuSecondsElapsed = acc.curTotal - acc.prevTotal

      if (wallSecondsElapsed <= 0 || cpuSecondsElapsed < 0) return acc.out

      const coresUsed = cpuSecondsElapsed / wallSecondsElapsed
      const prevValue = acc.out.at(-1)?.value

      if (shouldEmitPoint({ prevValue, currValue: coresUsed, tolerance })) {
        acc.out.push({ timestamp: acc.curTs, value: coresUsed })
      }

      return acc.out
    }

const cpuFold = ({ maxPoints, tolerance = 0, since, until } = {}) => ({
  filterFn: cpuFilter({ since, until }),
  seed: { ...cpuSeed, out: [] },
  reducer: cpuReducer({ tolerance }),
  finalize: R.pipe(
    cpuFinalize({ tolerance }),
    R.isNil(maxPoints) ? R.identity : downsampleMinMaxOrdered({ maxPoints }),
  ),
})

export default cpuFold
