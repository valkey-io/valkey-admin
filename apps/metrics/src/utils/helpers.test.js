import { describe, it, expect } from "vitest"
import { downsampleMinMaxOrdered } from "./helpers.js"

const mkSeries = (n, fn) =>
  Array.from({ length: n }, (_, i) => ({
    timestamp: i,
    value: fn(i),
  }))

describe("downsampleMinMaxOrdered", () => {
  it("returns [] for empty/undefined input", () => {
    expect(downsampleMinMaxOrdered({ maxPoints: 10 }, [])).toEqual([])
    expect(downsampleMinMaxOrdered({ maxPoints: 10 }, undefined)).toEqual([])
  })

  it("does not downsample when series length <= maxPoints", () => {
    const s = mkSeries(5, (i) => i)
    expect(downsampleMinMaxOrdered({ maxPoints: 5 }, s)).toBe(s) // same ref is fine with your implementation
  })

  it("always includes first and last points when downsampling", () => {
    const s = mkSeries(100, (i) => i)
    const out = downsampleMinMaxOrdered({ maxPoints: 10 }, s)

    expect(out[0]).toEqual(s[0])
    expect(out.at(-1)).toEqual(s.at(-1))
  })

  it("output length is <= maxPoints", () => {
    const s = mkSeries(1000, (i) => Math.sin(i))
    const out = downsampleMinMaxOrdered({ maxPoints: 120 }, s)
    expect(out.length).toBeLessThanOrEqual(120)
  })

  it("preserves spikes: includes global max and global min points", () => {
    const s = mkSeries(200, () => 0)

    // inject one big spike up and one spike down in the middle
    s[80] = { timestamp: 80, value: 999 }
    s[120] = { timestamp: 120, value: -999 }

    const out = downsampleMinMaxOrdered({ maxPoints: 20 }, s)

    // ensure those extrema points survived
    expect(out.some((p) => p.timestamp === 80 && p.value === 999)).toBe(true)
    expect(out.some((p) => p.timestamp === 120 && p.value === -999)).toBe(true)
  })

  it("keeps points ordered by timestamp (or at least non-decreasing)", () => {
    const s = mkSeries(500, (i) => (i % 50) - 25)
    const out = downsampleMinMaxOrdered({ maxPoints: 50 }, s)

    for (let i = 1; i < out.length; i++) {
      expect(out[i].timestamp).toBeGreaterThanOrEqual(out[i - 1].timestamp)
    }
  })

  it("does not crash when all timestamps are equal (timespan 0 safeguard)", () => {
    const s = Array.from({ length: 200 }, (_, i) => ({
      timestamp: 123,
      value: i,
    }))
    const out = downsampleMinMaxOrdered({ maxPoints: 20 }, s)
    expect(Array.isArray(out)).toBe(true)
    expect(out.length).toBeGreaterThan(0)
  })
})
