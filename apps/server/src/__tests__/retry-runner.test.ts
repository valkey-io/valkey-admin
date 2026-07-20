// Feature: server-side automatic retry with backoff for config updates.
// Tests for the modular retry runner: schedule, cap, status emissions, abort.
import { describe, it } from "node:test"
import assert from "node:assert"
import { NOT_ATTEMPTED_MESSAGE, retryDelay } from "valkey-common"
import { runWithRetry, type NodeStatusUpdate } from "../actions/retry-runner"
import { toOutcome, type NodeTarget } from "../actions/node-fanout"

const target = (nodeId: string, hasMetrics = true): NodeTarget => ({
  nodeId,
  metricsURI: hasMetrics ? `http://${nodeId}:9999` : undefined,
})

// Compact view of an emission sequence for assertions.
const seq = (updates: NodeStatusUpdate[]): string[] =>
  updates.map((u) => `${u.nodeId}:${u.status}@${u.attempt}`)

describe("runWithRetry", () => {
  it("emits attempting → succeeded on a first-attempt success and never delays", async () => {
    const updates: NodeStatusUpdate[] = []
    let calls = 0
    const result = await runWithRetry(
      [target("n1")],
      async () => { calls++; return { success: true, message: "ok" } },
      { delaysMs: [1, 1, 1], onNodeStatusUpdate: (u) => updates.push(u) },
    )

    assert.strictEqual(calls, 1)
    assert.deepStrictEqual(seq(updates), ["n1:attempting@1", "n1:succeeded@1"])
    assert.strictEqual(result.aborted, false)
    assert.strictEqual(result.attempted[0].success, true)
  })

  it("emits attempting(1) → retrying(1) → attempting(2) → succeeded on fail-then-succeed", async () => {
    const updates: NodeStatusUpdate[] = []
    let calls = 0
    const result = await runWithRetry(
      [target("n1")],
      async () => {
        calls++
        if (calls === 1) return { success: false, message: "boom" }
        return { success: true, message: "ok" }
      },
      { delaysMs: [1, 1, 1], onNodeStatusUpdate: (u) => updates.push(u) },
    )

    assert.deepStrictEqual(seq(updates), [
      "n1:attempting@1", "n1:retrying@1", "n1:attempting@2", "n1:succeeded@2",
    ])
    // The retrying emission carries the failure message and next delay.
    const retrying = updates.find((u) => u.status === "retrying")!
    assert.strictEqual(retrying.message, "boom")
    assert.strictEqual(retrying.nextRetryMs, 1)
    assert.strictEqual(result.attempted[0].success, true)
  })

  it("caps at maxRetries+1 attempts and yields a failed NodeResult with the last message", async () => {
    const updates: NodeStatusUpdate[] = []
    let calls = 0
    const result = await runWithRetry(
      [target("n1")],
      async () => { calls++; return { success: false, message: `fail ${calls}` } },
      { maxRetries: 2, delaysMs: [1], onNodeStatusUpdate: (u) => updates.push(u) },
    )

    assert.strictEqual(calls, 3) // initial + 2 retries
    const last = updates[updates.length - 1]
    assert.strictEqual(last.status, "failed")
    assert.strictEqual(last.attempt, 3)
    assert.strictEqual(last.maxAttempts, 3)
    assert.strictEqual(result.attempted[0].success, false)
    assert.strictEqual(result.attempted[0].message, "fail 3")
    assert.strictEqual(toOutcome(result), "failed")
  })

  it("follows the delay schedule and clamps past the end (via emitted nextRetryMs)", async () => {
    // The schedule is asserted through the `retrying` emissions, which carry
    // the exact delay the runner sleeps (`nextRetryMs`): deterministic and
    // avoids fake-timer choreography. Delays are tiny so the test is fast.
    const updates: NodeStatusUpdate[] = []
    await runWithRetry(
      [target("n1")],
      async () => ({ success: false, message: "x" }),
      { maxRetries: 3, delaysMs: [2, 4], onNodeStatusUpdate: (u) => updates.push(u) },
    )

    const delaysUsed = updates.filter((u) => u.status === "retrying").map((u) => u.nextRetryMs)
    // Retry 3 clamps to the LAST schedule entry (4), not an absent delays[2].
    assert.deepStrictEqual(delaysUsed, [2, 4, 4])
  })

  it("defaults the backoff to the shared Fibonacci retryDelay", async (t) => {
    // No delaysMs injected: the runner must schedule the shared
    // `retryDelay(n)` (Fibonacci: 1s, 2s, 3s, 5s, 8s, 13s). Assert via the
    // emitted nextRetryMs under fake timers so the test does not sleep.
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const updates: NodeStatusUpdate[] = []
    const promise = runWithRetry(
      [target("n1")],
      async () => ({ success: false, message: "x" }),
      { maxRetries: 2, onNodeStatusUpdate: (u) => updates.push(u) },
    )

    // Drain microtasks between ticks so each attempt/emission lands.
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 10; j++) await Promise.resolve()
      t.mock.timers.tick(retryDelay(i + 1))
    }
    await promise

    const delaysUsed = updates.filter((u) => u.status === "retrying").map((u) => u.nextRetryMs)
    assert.deepStrictEqual(delaysUsed, [retryDelay(1), retryDelay(2)])
  })

  it("session abort propagates into the in-flight attempt's signal", async () => {
    const controller = new AbortController()
    let opSignal: AbortSignal | undefined
    const promise = runWithRetry(
      [target("n1")],
      (_t, signal) =>
        new Promise<{ success: boolean; message: string }>((_resolve, reject) => {
          opSignal = signal
          signal?.addEventListener("abort", () => reject(new Error("aborted")))
        }),
      { delaysMs: [1], signal: controller.signal, onNodeStatusUpdate: () => {} },
    )

    controller.abort()
    const result = await promise

    // The hung attempt's underlying request was told to tear down, and the
    // session resolved promptly instead of waiting out the attempt timeout.
    assert.strictEqual(opSignal?.aborted, true)
    assert.strictEqual(result.aborted, true)
  })

  it("aborting mid-delay resolves promptly with aborted: true and emits nothing further", async () => {
    const updates: NodeStatusUpdate[] = []
    const controller = new AbortController()
    let calls = 0
    const promise = runWithRetry(
      [target("n1")],
      async () => {
        calls++
        // Abort while the runner is waiting out the (long) backoff delay.
        setTimeout(() => controller.abort(), 5)
        return { success: false, message: "boom" }
      },
      { delaysMs: [60_000], signal: controller.signal, onNodeStatusUpdate: (u) => updates.push(u) },
    )

    const result = await promise
    assert.strictEqual(result.aborted, true)
    assert.strictEqual(calls, 1) // no second attempt after abort
    // Only pre-abort emissions are present; nothing after the abort.
    assert.deepStrictEqual(seq(updates), ["n1:attempting@1", "n1:retrying@1"])
  })

  it("excludes not-attempted targets from the retry loop and emits one not_attempted status", async () => {
    const updates: NodeStatusUpdate[] = []
    let calls = 0
    const result = await runWithRetry(
      [target("n1"), target("ghost", false)],
      async () => { calls++; return { success: true, message: "ok" } },
      { delaysMs: [1], onNodeStatusUpdate: (u) => updates.push(u) },
    )

    assert.strictEqual(calls, 1) // only n1 attempted
    assert.deepStrictEqual(result.notAttempted, ["ghost"])
    const ghost = updates.find((u) => u.nodeId === "ghost")!
    assert.strictEqual(ghost.status, "not_attempted")
    assert.strictEqual(ghost.attempt, 0)
    assert.strictEqual(ghost.message, NOT_ATTEMPTED_MESSAGE)
    assert.strictEqual(toOutcome(result), "fulfilled")
  })
})
