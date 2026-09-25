import { describe, it } from "node:test"
import assert from "node:assert"
import { findBlockedCommand, findConfirmCommand, parseCommandArgs } from "../command-restrictions"

describe("command restrictions", () => {
  describe("findBlockedCommand", () => {
    for (const name of ["SELECT", "AUTH", "HELLO", "RESET", "QUIT"]) {
      for (const command of [name, name.toLowerCase(), `"${name}"`, `'${name.toLowerCase()}'`]) {
        it(`blocks connection-state command ${command} without connection context`, () => {
          const restriction = findBlockedCommand(parseCommandArgs(`  ${command}  argument  `))
          assert.deepStrictEqual(restriction?.pattern, [name])
          assert.match(restriction!.reason, /shared connection/)
        })
      }
    }

    it("does not confuse arguments, prefixes or subcommands with blocked commands", () => {
      for (const command of ["GET SELECT", "SET AUTH value", "SELECTED 1", "CLIENT INFO", "PING", "CLUSTER RESET", ""]) {
        assert.strictEqual(findBlockedCommand(parseCommandArgs(command)), undefined, command)
      }
    })

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
    it("does not offer confirmation for blocked connection-state commands", () => {
      for (const command of ["SELECT 1", "AUTH user secret", "HELLO 3", "RESET", "QUIT"]) {
        assert.ok(findBlockedCommand(parseCommandArgs(command)))
        assert.strictEqual(findConfirmCommand(parseCommandArgs(command)), undefined)
      }
    })

    it("preserves existing confirmation rules", () => {
      for (const command of ["KEYS *", "CONFIG RESETSTAT", "CONFIG REWRITE", "SLAVEOF host 6379", "REPLICAOF host 6379", "CLUSTER RESET"]) {
        assert.ok(findConfirmCommand(parseCommandArgs(command)), command)
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
