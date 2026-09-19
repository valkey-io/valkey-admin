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
    for (const command of ["SELECT 1", "select 1", "\"SELECT\" 1", "'select' 1"]) {
      it(`requires confirmation for ${command} on cluster connections`, () => {
        const restriction = findConfirmCommand(parseCommandArgs(command), { isCluster: true })
        assert.deepStrictEqual(restriction?.pattern, ["SELECT"])
        assert.match(restriction!.reason, /shared cluster client/)
      })
    }

    it("does not require SELECT confirmation on standalone connections", () => {
      assert.strictEqual(findConfirmCommand(parseCommandArgs("SELECT 1"), { isCluster: false }), undefined)
    })

    it("preserves SELECT behavior when cluster context is omitted", () => {
      assert.strictEqual(findConfirmCommand(parseCommandArgs("SELECT 1")), undefined)
      assert.strictEqual(findConfirmCommand(parseCommandArgs("SELECT 1"), {}), undefined)
    })

    for (const isCluster of [true, false]) {
      it(`preserves existing confirmation rules with isCluster=${isCluster}`, () => {
        for (const command of ["KEYS *", "CONFIG RESETSTAT", "CONFIG REWRITE", "SLAVEOF host 6379", "REPLICAOF host 6379", "CLUSTER RESET"]) {
          assert.ok(findConfirmCommand(parseCommandArgs(command), { isCluster }), command)
        }
      })
    }

    it("does not confirm unrelated commands on cluster connections", () => {
      for (const command of ["GET SELECT", "SELECTED 1", ""]) {
        assert.strictEqual(findConfirmCommand(parseCommandArgs(command), { isCluster: true }), undefined)
      }
    })

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
