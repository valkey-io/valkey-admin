import { describe, it, expect } from "vitest"

import { cpuSeed, cpuFilter, cpuReducer, cpuFinalize } from "./calculate-cpu-usage.js"

const runCpu = (rows) => {
  const acc = rows
    .filter(cpuFilter)
    .reduce(cpuReducer, { ...cpuSeed, out: [] }) // fresh accumulator per test run

  return cpuFinalize(acc)
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
})
