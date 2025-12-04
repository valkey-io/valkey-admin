import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { startCollector } from "./collector-rx.js"

describe("startCollector", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  // Simulate a fetch that resolves slower than the poll interval so multiple timer ticks occur while one fetch is
  // still running, then assert that fetch is not called on every tick—proving exhaustMap blocks overlapping executions.
  it("calls fetch on interval and never overlaps fetch calls", async () => {
    const fetch = vi.fn(() => {
      // simulate a fetch slower than the interval (80ms fetch vs 50ms interval)
      return new Promise(resolve => {
        setTimeout(() => resolve([{ id: "row" }]), 80)
      })
    })

    const writer = { appendRows: vi.fn(() => Promise.resolve()) }

    const stop = startCollector({
      name: "cpu",
      pollMs: 50, // ticks every 50ms
      fetch,
      writer,
      batchMs: 100,
      batchMax: 100,
    })

    await vi.advanceTimersByTimeAsync(300)

    stop()

    // because fetch takes 80ms, `exhaustMap` should prevent overlaps
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(fetch.mock.calls.length).toBeLessThanOrEqual(4)

    expect(writer.appendRows).toHaveBeenCalled()
  })

  // Make the first two polls return known rows and later polls return an empty array,
  // then assert writer.appendRows is called once with a single merged batch.
  it("batches rows and passes arrays to writer.appendRows", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      .mockResolvedValueOnce([{ id: 3 }])
      .mockResolvedValue([])

    const writer = { appendRows: vi.fn(() => Promise.resolve()) }

    const stop = startCollector({
      name: "cpu",
      pollMs: 50,
      fetch,
      writer,
      batchMs: 200, // big enough to batch multiple polls
      batchMax: 100,
    })

    await vi.advanceTimersByTimeAsync(300)

    stop()

    expect(writer.appendRows).toHaveBeenCalledTimes(1)
    const [batch] = writer.appendRows.mock.calls[0]

    expect(Array.isArray(batch)).toBe(true)
    expect(batch).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ])
  })

  // Make the first fetch fail and the next one succeed, advance timers through retry,
  // and assert writer.appendRows eventually gets the successful row.
  it("retries fetch on error and eventually writes rows", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValue([])

    const writer = { appendRows: vi.fn(() => Promise.resolve()) }

    const stop = startCollector({
      name: "cpu",
      pollMs: 50,
      fetch,
      writer,
      batchMs: 100,
      batchMax: 100,
    })

    // advance enough time to cover poll + backoff + retry
    await vi.advanceTimersByTimeAsync(3000)

    stop()

    // fetch should have been called at least twice (fail + retry)
    expect(fetch.mock.calls.length).toBeGreaterThanOrEqual(2)

    // writer should eventually be called with exactly the successful rows
    expect(writer.appendRows).toHaveBeenCalled()
    const [batch] = writer.appendRows.mock.calls[0]
    expect(batch).toEqual([{ id: 1 }])
  })

  // Let the collector run briefly and record the call counts. After calling stop(), advance the timers well beyond
  // several poll intervals to simulate time passing, and then assert that no additional fetch or writer calls occur.
  it("stops polling and writing after the returned stopper is called", async () => {
    const fetch = vi.fn().mockResolvedValue([{ id: 1 }])
    const writer = { appendRows: vi.fn(() => Promise.resolve()) }

    const stop = startCollector({
      name: "cpu",
      pollMs: 50,
      fetch,
      writer,
      batchMs: 100,
      batchMax: 100,
    })

    await vi.advanceTimersByTimeAsync(200) // let it run a bit

    const fetchCallsBeforeStop = fetch.mock.calls.length
    const writesBeforeStop = writer.appendRows.mock.calls.length

    stop()

    await vi.advanceTimersByTimeAsync(500) // advance more time; nothing new should happen

    expect(fetch.mock.calls.length).toBe(fetchCallsBeforeStop)
    expect(writer.appendRows.mock.calls.length).toBe(writesBeforeStop)
  })
})
