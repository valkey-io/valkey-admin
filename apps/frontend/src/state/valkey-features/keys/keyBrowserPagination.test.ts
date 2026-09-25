import { describe, it, expect } from "vitest"
import reducer, { getKeysRequested, getKeysFulfilled, getKeysFailed } from "./keyBrowserSlice"

describe("key browser pagination", () => {
  it("marks expired scans for restart and clears the flag on a fresh request", () => {
    const first = getKeysRequested({ connectionId: "db0" })
    let state = reducer({}, first)
    state = reducer(state, getKeysFulfilled({ ...first.payload, keys: [{ name: "a" }], cursor: "old", totalKeys: 1000 }))
    state = reducer(state, getKeysFailed({ ...first.payload, error: "expired", restartRequired: true }))
    expect(state.db0.restartRequired).toBe(true)
    expect(state.db0.keys).toHaveLength(1)
    state = reducer(state, getKeysRequested({ connectionId: "db0" }))
    expect(state.db0.restartRequired).toBe(false)
    expect(state.db0.keys).toEqual([])
  })
  it("appends, deduplicates and sorts loaded keys", () => {
    const first = getKeysRequested({ connectionId: "db0" })
    let state = reducer({}, first)
    state = reducer(state, getKeysFulfilled({
      ...first.payload, keys: [{ name: "z" }, { name: "b" }], cursor: "next", totalKeys: 2000,
    }))
    const next = getKeysRequested({ connectionId: "db0", cursor: "next" })
    state = reducer(state, next)
    expect(state.db0.loading).toBe(false)
    expect(state.db0.pageLoading).toBe(true)
    state = reducer(state, getKeysFulfilled({
      ...next.payload, keys: [{ name: "a" }, { name: "b" }], cursor: "0", totalKeys: 2000,
    }))
    expect(state.db0.keys.map((key) => key.name)).toEqual(["a", "b", "z"])
    expect(state.db0.pageLoading).toBe(false)
  })

  it("resets a query and ignores stale success and failure responses", () => {
    const first = getKeysRequested({ connectionId: "db0" })
    let state = reducer({}, first)
    const second = getKeysRequested({ connectionId: "db0", pattern: "new*", keyType: "hash" })
    state = reducer(state, second)
    state = reducer(state, getKeysFulfilled({
      ...first.payload, keys: [{ name: "old" }], cursor: "next", totalKeys: 2000,
    }))
    state = reducer(state, getKeysFailed({ ...first.payload, error: "old error" }))
    expect(state.db0.keys).toEqual([])
    expect(state.db0.error).toBeNull()
    expect(state.db0.pageLoading).toBe(true)
    expect(state.db0.pattern).toBe("new*")
    expect(state.db0.keyType).toBe("hash")
  })

  it("keeps the continuation after failure for retry", () => {
    const first = getKeysRequested({ connectionId: "db0" })
    let state = reducer({}, first)
    state = reducer(state, getKeysFulfilled({ ...first.payload, keys: [], cursor: "next", totalKeys: 2000 }))
    const next = getKeysRequested({ connectionId: "db0", cursor: "next" })
    state = reducer(state, next)
    state = reducer(state, getKeysFailed({ ...next.payload, error: "temporary failure" }))
    expect(state.db0.cursor).toBe("next")
    expect(state.db0.pageLoading).toBe(false)
  })
})
