import { describe, it } from "node:test"
import assert from "node:assert"
import { findBlockedCommand, findConfirmCommand, parseCommandArgs } from "../command-restrictions"

describe("command restrictions", () => {
  describe("findBlockedCommand", () => {
    it("blocks FLUSHALL", () => {
      assert.ok(findBlockedCommand(parseCommandArgs("FLUSHALL")))
    })

    it("blocks FLUSHALL with arguments", () => {
      assert.ok(findBlockedCommand(parseCommandArgs("FLUSHALL ASYNC")))
    })

    it("blocks quoted FLUSHALL (bypass fix)", () => {
      assert.ok(findBlockedCommand(parseCommandArgs("\"FLUSHALL\"")))
    })

    it("blocks single-quoted FLUSHALL (bypass fix)", () => {
      assert.ok(findBlockedCommand(parseCommandArgs("'FLUSHALL'")))
    })

    it("blocks SHUTDOWN regardless of quoting", () => {
      assert.ok(findBlockedCommand(parseCommandArgs("\"SHUTDOWN\"")))
    })

    it("blocks DEBUG regardless of quoting", () => {
      assert.ok(findBlockedCommand(parseCommandArgs("\"DEBUG\" SLEEP 1")))
    })

    it("does not block normal commands", () => {
      assert.strictEqual(findBlockedCommand(parseCommandArgs("GET mykey")), undefined)
    })

    it("is case-insensitive", () => {
      assert.ok(findBlockedCommand(parseCommandArgs("flushall")))
      assert.ok(findBlockedCommand(parseCommandArgs("\"flushdb\"")))
    })
  })

  describe("findConfirmCommand", () => {
    it("requires confirmation for KEYS", () => {
      assert.ok(findConfirmCommand(parseCommandArgs("KEYS *")))
    })

    it("requires confirmation for quoted KEYS (bypass fix)", () => {
      assert.ok(findConfirmCommand(parseCommandArgs("\"KEYS\" *")))
    })

    it("requires confirmation for CLUSTER RESET", () => {
      assert.ok(findConfirmCommand(parseCommandArgs("CLUSTER RESET")))
    })

    it("requires confirmation for quoted CLUSTER RESET", () => {
      assert.ok(findConfirmCommand(parseCommandArgs("\"CLUSTER\" \"RESET\"")))
    })

    it("does not confirm normal commands", () => {
      assert.strictEqual(findConfirmCommand(parseCommandArgs("GET mykey")), undefined)
    })
  })
})
