import { describe, it, expect, afterEach } from "vitest"
import {
  downsampleMinMaxOrdered,
  normalizeNodeScopedResponse,
  parseInfo,
  parseInfoToPairs,
  parseKeyspace,
  toFiniteNumber
} from "./helpers.js"

const mkSeries = (n, fn) =>
  Array.from({ length: n }, (_, i) => ({
    timestamp: Date.now() + i,
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
    const upSpikeTimestamp = Date.now() + 80
    const downSpikeTimestamp = Date.now() + 120

    // inject one big spike up and one spike down in the middle
    s[80] = { timestamp: upSpikeTimestamp, value: 999 }
    s[120] = { timestamp: downSpikeTimestamp, value: -999 }

    const out = downsampleMinMaxOrdered({ maxPoints: 20 }, s)

    // ensure those extrema points survived
    expect(out.some((p) => p.timestamp === upSpikeTimestamp && p.value === 999)).toBe(true)
    expect(out.some((p) => p.timestamp === downSpikeTimestamp && p.value === -999)).toBe(true)
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

describe("parseInfoToPairs", () => {
  it("skips blank lines and section headers, and trims each line", () => {
    expect(parseInfoToPairs("# Memory\r\nused_memory:100\r\n\r\n  maxmemory:0  \n")).toEqual([
      ["used_memory", "100"],
      ["maxmemory", "0"],
    ])
  })

  it("keeps a value that holds a colon", () => {
    expect(parseInfoToPairs("executable:/usr/bin/valkey-server\nbind:::1")).toEqual([
      ["executable", "/usr/bin/valkey-server"],
      ["bind", "::1"],
    ])
  })

  it("skips a line without a colon", () => {
    expect(parseInfoToPairs("used_memory:100\nnot-a-field")).toEqual([["used_memory", "100"]])
  })

  it("returns no pairs for an empty or absent reply", () => {
    expect(parseInfoToPairs("")).toEqual([])
    expect(parseInfoToPairs(undefined)).toEqual([])
    expect(parseInfoToPairs(null)).toEqual([])
  })
})

describe("parseInfo", () => {
  it("returns a map of string values", () => {
    expect(parseInfo("used_memory:100\nmaxmemory_policy:noeviction")).toEqual({
      used_memory: "100",
      maxmemory_policy: "noeviction",
    })
  })
})

describe("toFiniteNumber", () => {
  it("parses a numeric string", () => {
    expect(toFiniteNumber("10.5")).toBe(10.5)
    expect(toFiniteNumber(" 7 ")).toBe(7)
    expect(toFiniteNumber("0")).toBe(0)
    expect(toFiniteNumber(3)).toBe(3)
  })

  it("is undefined for an absent, empty or non-numeric value", () => {
    expect(toFiniteNumber(undefined)).toBeUndefined()
    expect(toFiniteNumber(null)).toBeUndefined()
    expect(toFiniteNumber("")).toBeUndefined()
    expect(toFiniteNumber("  ")).toBeUndefined()
    expect(toFiniteNumber("abc")).toBeUndefined()
    expect(toFiniteNumber("Infinity")).toBeUndefined()
  })
})

describe("parseKeyspace", () => {
  it("parses keys and expires per database index", () => {
    expect(parseKeyspace(parseInfoToPairs("# Keyspace\r\ndb0:keys=2,expires=1,avg_ttl=0\r\ndb3:keys=1,expires=0,avg_ttl=0")))
      .toEqual({ 0: { keys: 2, expires: 1 }, 3: { keys: 1, expires: 0 } })
  })

  it("ignores rows that are not db<N>", () => {
    expect(parseKeyspace([["dbx", "keys=1,expires=0"], ["foo", "keys=1"], ["db1", "keys=4,expires=2"]]))
      .toEqual({ 1: { keys: 4, expires: 2 } })
  })

  it("ignores a row without a numeric keys or expires value", () => {
    expect(parseKeyspace([["db2", "keys=abc,expires=1"], ["db4", "avg_ttl=0"]])).toEqual({})
  })

  it("returns an empty map for an empty reply", () => {
    expect(parseKeyspace([])).toEqual({})
  })
})

describe("normalizeNodeScopedResponse", () => {
  const savedHost = process.env.VALKEY_HOST
  const savedPort = process.env.VALKEY_PORT

  afterEach(() => {
    if (savedHost === undefined) delete process.env.VALKEY_HOST
    else process.env.VALKEY_HOST = savedHost
    if (savedPort === undefined) delete process.env.VALKEY_PORT
    else process.env.VALKEY_PORT = savedPort
  })

  it("returns a string, an array or nullish as it is", () => {
    expect(normalizeNodeScopedResponse("used_memory:1")).toBe("used_memory:1")
    const list = [1, 2]
    expect(normalizeNodeScopedResponse(list)).toBe(list)
    expect(normalizeNodeScopedResponse(null)).toBeNull()
  })

  it("picks the entry for VALKEY_HOST:VALKEY_PORT", () => {
    process.env.VALKEY_HOST = "b"
    process.env.VALKEY_PORT = "6379"
    expect(normalizeNodeScopedResponse({ "a:6379": "one", "b:6379": "two" })).toBe("two")
  })

  it("falls back to the first entry when the local node is missing", () => {
    process.env.VALKEY_HOST = "c"
    process.env.VALKEY_PORT = "6379"
    expect(normalizeNodeScopedResponse({ "a:6379": "one", "b:6379": "two" })).toBe("one")
  })
})
