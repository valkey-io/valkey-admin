import { describe, it, expect } from "vitest"
import { calculateHotKeysFromMonitor } from "./calculate-hot-keys.js"

describe("calculateHotKeysFromMonitor", () => {
  it("aggregates access commands into key frequencies and filters by cutoff", () => {
    const rows = [
      { ts: 1, command: "GET foo" },
      { ts: 2, command: "set foo 123" },
      { ts: 3, command: "get bar" },
      { ts: 4, command: "HGET foo field" },
      { ts: 5, command: "INCR counter" }, // ignored
      { ts: 6, command: "  GET   foo   " }, // extra spaces handled
    ]

    const result = calculateHotKeysFromMonitor(rows)

    // CUT_OFF_FREQUENCY = 1, so "bar", "field" are filtered out (1 hit each) while foo gets 4 GETs (no pun intended)
    expect(result).toEqual([
      ["foo", 4],
    ])
  })

  it("counts multi-key commands and keeps keys above cutoff", () => {
    const rows = [
      { ts: 1, command: "MGET foo bar baz" },
      { ts: 2, command: "json.mget user:1 user:2" },
      { ts: 3, command: "GET foo" }, // foo again, now with  2 hits
      { ts: 4, command: "PING" }, // ignored
    ]

    const result = calculateHotKeysFromMonitor(rows)

    // foo: 2 hits, bar/baz/user:1/user:2: 1 hit each, so only foo survives cutoff > 1
    expect(result).toEqual([
      ["foo", 2],
    ])
  })

  it("returns empty array when there are no matching access commands", () => {
    const rows = [
      { ts: 1, command: "PING" },
      { ts: 2, command: "INCR counter" },
      { ts: 3, command: "DEL foo" },
    ]

    const result = calculateHotKeysFromMonitor(rows)

    expect(result).toEqual([])
  })
})
