// Tests for the per-node fan-out primitives: the bounded single-attempt
// runner and outcome classification.
import { describe, it } from "node:test"
import assert from "node:assert"
import {
  MAX_NODE_MESSAGE_LEN,
  MISSING_MESSAGE,
  NODE_TIMEOUT_MESSAGE,
  PER_NODE_TIMEOUT_MS
} from "valkey-common"
import {
  runNodeAttempt,
  toOutcome,
  type CollectionResult,
  type NodeTarget
} from "../actions/node-fanout"

const target: NodeTarget = { nodeId: "n1", metricsURI: "http://n1:9999" }

describe("runNodeAttempt", () => {
  it("resolves a success outcome with the op's message", async () => {
    const result = await runNodeAttempt(target, async () => ({ success: true, message: "ok" }))
    assert.deepStrictEqual(result, { nodeId: "n1", success: true, message: "ok" })
  })

  it("converts a rejection into a failed NodeResult instead of rejecting", async () => {
    const result = await runNodeAttempt(target, async () => { throw new Error("kaboom") })
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.message, "kaboom")
  })

  it("backfills an empty message and clamps an over-long one", async () => {
    const empty = await runNodeAttempt(target, async () => ({ success: false, message: "" }))
    assert.strictEqual(empty.message, MISSING_MESSAGE)

    const long = "x".repeat(MAX_NODE_MESSAGE_LEN + 500)
    const clamped = await runNodeAttempt(target, async () => ({ success: false, message: long }))
    assert.strictEqual(clamped.message.length, MAX_NODE_MESSAGE_LEN)
  })

  it("records a timeout failure when the op does not resolve within the bound", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const pendingOp = () => new Promise<{ success: boolean; message: string }>(() => {})
    const promise = runNodeAttempt(target, pendingOp)
    t.mock.timers.tick(PER_NODE_TIMEOUT_MS)
    const result = await promise

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.message, NODE_TIMEOUT_MESSAGE)
  })

  it("aborts the op's signal when the attempt times out", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] })
    let opSignal: AbortSignal | undefined
    const pendingOp = (_t: NodeTarget, signal?: AbortSignal) => {
      opSignal = signal
      return new Promise<{ success: boolean; message: string }>(() => {})
    }
    const promise = runNodeAttempt(target, pendingOp)
    t.mock.timers.tick(PER_NODE_TIMEOUT_MS)
    const result = await promise

    // The race records the timeout result AND the underlying request is
    // told to tear down.
    assert.strictEqual(result.message, NODE_TIMEOUT_MESSAGE)
    assert.strictEqual(opSignal?.aborted, true)
  })

  it("chains a caller abort into the op's signal", async () => {
    const controller = new AbortController()
    let opSignal: AbortSignal | undefined
    const op = (_t: NodeTarget, signal?: AbortSignal) =>
      new Promise<{ success: boolean; message: string }>((_resolve, reject) => {
        opSignal = signal
        signal?.addEventListener("abort", () => reject(new Error("aborted")))
      })

    const promise = runNodeAttempt(target, op, 60_000, controller.signal)
    controller.abort()
    const result = await promise

    assert.strictEqual(opSignal?.aborted, true)
    assert.strictEqual(result.success, false)
  })

  it("still resolves via the timeout race when an op IGNORES an aborted signal", async (t) => {
    // The signal is cooperative; the race is the guarantee. An op that never
    // resolves and never listens to its signal must not hang the attempt —
    // the timeout result wins.
    t.mock.timers.enable({ apis: ["setTimeout"] })
    const controller = new AbortController()
    const deafOp = () => new Promise<{ success: boolean; message: string }>(() => {})

    const promise = runNodeAttempt(target, deafOp, PER_NODE_TIMEOUT_MS, controller.signal)
    controller.abort() // op ignores this
    t.mock.timers.tick(PER_NODE_TIMEOUT_MS)
    const result = await promise

    assert.strictEqual(result.success, false)
    assert.strictEqual(result.message, NODE_TIMEOUT_MESSAGE)
  })

  it("hands the op an already-aborted signal when the caller aborted before the attempt", async () => {
    // A session abort racing a new attempt start: the attempt's signal must
    // be born aborted so a cooperative op never issues a real request.
    const controller = new AbortController()
    controller.abort()
    let opSignal: AbortSignal | undefined
    const result = await runNodeAttempt(
      target,
      async (_t, signal) => {
        opSignal = signal
        return { success: false, message: "should not matter" }
      },
      1000,
      controller.signal,
    )

    assert.strictEqual(opSignal?.aborted, true)
    assert.strictEqual(result.success, false)
  })

  it("detaches its abort listener from the caller signal after each attempt", async () => {
    const controller = new AbortController()
    // Sequential attempts against ONE shared (session) signal, as the retry
    // runner does; listeners must not accumulate across attempts.
    for (let i = 0; i < 15; i++) {
      await runNodeAttempt(target, async () => ({ success: false, message: "x" }), 1000, controller.signal)
    }
    const { getEventListeners } = await import("node:events")
    assert.strictEqual(getEventListeners(controller.signal, "abort").length, 0)
  })
})

describe("toOutcome", () => {
  const r = (attempted: CollectionResult["attempted"], notAttempted: string[] = []): CollectionResult => ({
    attempted,
    notAttempted,
  })

  it("is not_attempted when no node was attempted", () => {
    assert.strictEqual(toOutcome(r([], ["n1"])), "not_attempted")
    assert.strictEqual(toOutcome(r([])), "not_attempted")
  })

  it("is failed when any attempted node failed", () => {
    assert.strictEqual(
      toOutcome(r([
        { nodeId: "n1", success: true, message: "ok" },
        { nodeId: "n2", success: false, message: "boom" },
      ])),
      "failed",
    )
  })

  it("is fulfilled when all attempted nodes succeeded", () => {
    assert.strictEqual(
      toOutcome(r([
        { nodeId: "n1", success: true, message: "ok" },
        { nodeId: "n2", success: true, message: "ok" },
      ])),
      "fulfilled",
    )
  })
})
