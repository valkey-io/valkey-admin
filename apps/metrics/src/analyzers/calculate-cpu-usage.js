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

export const cpuFilter = ({ metric }) => metric === "used_cpu_sys" || metric === "used_cpu_user"

/**
 * Adds CPU values for the current timestamp and emits when the timestamp changes.
 * Basically, we do all this logic because a line in the file can be either "used_cpu_sys" or "used_cpu_user".
 * To calculate one CPU usage value for a single timestamp, we need to read at least two lines to encounter both.
 * And to calculate a delta, we need two timestamps.
 *
 * @param {{
 *   out: Array<{ timestamp: number, value: number }>,
 *   prevTs: number | null,
 *   prevTotal: number,
 *   curTs: number | null,
 *   curTotal: number | null
 * }} acc
 * @param {{ ts: number, value: number }} row
 */
export const cpuReducer = (acc/*: cpuSeed */, { ts, value }) => {
  acc.curTs ??= ts
  acc.curTotal ??= 0

  if (ts !== acc.curTs) {
    if (acc.prevTs != null) { // Close the previous bucket
      const wallSecondsElapsed = (acc.curTs - acc.prevTs) / 1000
      const cpuSecondsElapsed = acc.curTotal - acc.prevTotal

      if (wallSecondsElapsed > 0 && cpuSecondsElapsed >= 0) {
        acc.out.push({
          timestamp: acc.curTs,
          value: cpuSecondsElapsed / wallSecondsElapsed,
        })
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
export const cpuFinalize = (acc) => {
  if (acc.prevTs == null || acc.curTs == null) return acc.out

  const wallSecondsElapsed = (acc.curTs - acc.prevTs) / 1000
  const cpuSecondsElapsed = acc.curTotal - acc.prevTotal

  if (wallSecondsElapsed <= 0 || cpuSecondsElapsed < 0) return acc.out

  acc.out.push({
    timestamp: acc.curTs,
    value: cpuSecondsElapsed / wallSecondsElapsed,
  })

  return acc.out
}
