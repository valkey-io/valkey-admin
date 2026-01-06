import { describe, it, expect } from "vitest"

import { cpuSeed, cpuFilter, cpuReducer, cpuFinalize } from "./calculate-cpu-usage.js"

const runCpu = (rows, { tolerance = 0 } = {}) => {
  const acc = rows
    .filter(cpuFilter)
    .reduce(cpuReducer({ tolerance }), { ...cpuSeed, out: [] }) // fresh accumulator per test run

  return cpuFinalize({ tolerance })(acc)
}

describe("cpu", () => {
  it("sums sys+user per timestamp and outputs cores-used deltas", () => {
    // ts1 total = 10, ts2 total = 16, ts3 total = 21
    // dt(ts2-ts1)=10s => (16-10)/10 = 0.6
    // dt(ts3-ts2)=10s => (21-16)/10 = 0.5
    const rows = [
      { ts: 1000, metric: "used_cpu_sys", value: 4 },
      { ts: 1000, metric: "used_cpu_user", value: 6 },

      { ts: 11000, metric: "used_cpu_sys", value: 7 },
      { ts: 11000, metric: "used_cpu_user", value: 9 },

      { ts: 21000, metric: "used_cpu_sys", value: 9 },
      { ts: 21000, metric: "used_cpu_user", value: 12 },
    ]

    expect(runCpu(rows)).toEqual([
      { timestamp: 11000, value: 0.6 },
      { timestamp: 21000, value: 0.5 },
    ])
  })

  it("ignores non-cpu metrics via cpuFilter", () => {
    const rows = [
      { ts: 1000, metric: "something_else", value: 999 },
      { ts: 1000, metric: "used_cpu_sys", value: 1 },
      { ts: 1000, metric: "used_cpu_user", value: 1 },

      { ts: 2000, metric: "something_else", value: 999 },
      { ts: 2000, metric: "used_cpu_sys", value: 2 },
      { ts: 2000, metric: "used_cpu_user", value: 2 },
    ]

    // total ts1=2, ts2=4, dt=1s => 2 cores
    expect(runCpu(rows)).toEqual([{ timestamp: 2000, value: 2 }])
  })

  it("returns empty series when there is only one timestamp (no delta possible)", () => {
    const rows = [
      { ts: 1000, metric: "used_cpu_sys", value: 1 },
      { ts: 1000, metric: "used_cpu_user", value: 2 },
    ]

    expect(runCpu(rows)).toEqual([])
  })

  it("skips a point when counters go backwards (e.g. restart) and resumes on next valid delta", () => {
    const rows = [
      { ts: 1000, metric: "used_cpu_sys", value: 10 },
      { ts: 1000, metric: "used_cpu_user", value: 10 }, // total 20

      // "restart": counters reset lower
      { ts: 2000, metric: "used_cpu_sys", value: 1 },
      { ts: 2000, metric: "used_cpu_user", value: 1 }, // total 2 (negative delta)

      { ts: 3000, metric: "used_cpu_sys", value: 2 },
      { ts: 3000, metric: "used_cpu_user", value: 2 }, // total 4
    ]

    // First delta skipped; next delta: (4-2)/1s = 2 cores
    expect(runCpu(rows)).toEqual([{ timestamp: 3000, value: 2 }])
  })

  it("skips points within tolerance, but does not skip transitions to/from zero (skips only 0->0)", () => {
    // We craft deltas directly via totals:
    // ts1 total=1, ts2 total=2 => cores=1
    // ts3 total=3 => cores=1 (within tolerance vs prev=1) => should be skipped
    // ts4 total=3 => cores=0 (1->0) => must NOT be skipped
    // ts5 total=3 => cores=0 (0->0) => should be skipped
    // ts6 total=4 => cores=1 (0->1) => must NOT be skipped
    const rows = [
      { ts: 0, metric: "used_cpu_sys", value: 1 },
      { ts: 0, metric: "used_cpu_user", value: 0 }, // total 1

      { ts: 1000, metric: "used_cpu_sys", value: 2 },
      { ts: 1000, metric: "used_cpu_user", value: 0 }, // total 2 => cores 1

      { ts: 2000, metric: "used_cpu_sys", value: 3 },
      { ts: 2000, metric: "used_cpu_user", value: 0 }, // total 3 => cores 1 (skip vs prev)

      { ts: 3000, metric: "used_cpu_sys", value: 3 },
      { ts: 3000, metric: "used_cpu_user", value: 0 }, // total 3 => cores 0 (do not skip)

      { ts: 4000, metric: "used_cpu_sys", value: 3 },
      { ts: 4000, metric: "used_cpu_user", value: 0 }, // total 3 => cores 0 (skip 0->0)

      { ts: 5000, metric: "used_cpu_sys", value: 4 },
      { ts: 5000, metric: "used_cpu_user", value: 0 }, // total 4 => cores 1 (do not skip)
    ]

    expect(runCpu(rows, { tolerance: 0.2 })).toEqual([
      { timestamp: 1000, value: 1 },
      { timestamp: 3000, value: 0 },
      { timestamp: 5000, value: 1 },
    ])
  })
})
