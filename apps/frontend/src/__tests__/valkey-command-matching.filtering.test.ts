import { describe, it, expect } from "vitest"
import {
  getCommands,
  searchCommands,
  matchCommands
} from "../utils/valkey-command-matching"

describe("Valkey Command Filtering", () => {
  describe("getCommands", () => {
    it("should return only read and mutating commands when adminMode is false", () => {
      const commands = getCommands({ adminMode: false })

      commands.forEach((command) => {
        expect(["read", "mutating"]).toContain(command.tier)
      })
    })

    it("should return all commands including admin when adminMode is true", () => {
      const allCommands = getCommands({ adminMode: true })
      const nonAdminCommands = getCommands({ adminMode: false })

      expect(allCommands.length).toBeGreaterThan(nonAdminCommands.length)

      const hasAdminCommands = allCommands.some((c) => c.tier === "admin")
      expect(hasAdminCommands).toBe(true)
    })

    it("should default to adminMode false when no options provided", () => {
      const commands = getCommands()

      commands.forEach((command) => {
        expect(["read", "mutating"]).toContain(command.tier)
      })
    })
  })

  describe("searchCommands", () => {
    it("should not return admin commands when adminMode is false", () => {
      const results = searchCommands("FLUSH", { adminMode: false })

      results.forEach((result) => {
        expect(result.command.tier).not.toBe("admin")
      })
    })

    it("should return admin commands when adminMode is true", () => {
      const results = searchCommands("FLUSH", { adminMode: true })

      const hasFlushDb = results.some((r) => r.command.name === "FLUSHDB")
      const hasFlushAll = results.some((r) => r.command.name === "FLUSHALL")

      expect(hasFlushDb || hasFlushAll).toBe(true)
    })

    it("should respect maxResults parameter", () => {
      const results = searchCommands("S", { maxResults: 5 })

      expect(results.length).toBeLessThanOrEqual(5)
    })

    it("should return empty array for empty query", () => {
      const results = searchCommands("", { adminMode: true })

      expect(results).toEqual([])
    })
  })

  describe("matchCommands", () => {
    it("should filter by adminMode parameter", () => {
      const withoutAdmin = matchCommands("CONFIG", 10, false)
      const withAdmin = matchCommands("CONFIG", 10, true)

      expect(withAdmin.length).toBeGreaterThanOrEqual(withoutAdmin.length)
    })

    it("should prioritize prefix matches", () => {
      const results = matchCommands("GET", 10, false)

      if (results.length > 0) {
        expect(results[0].command.name).toBe("GET")
        expect(results[0].matchType).toBe("prefix")
      }
    })

    it("should return contains matches", () => {
      const results = matchCommands("SCAN", 10, false)

      const hasScan = results.some((r) => r.command.name === "SCAN")
      const hasHscan = results.some((r) => r.command.name === "HSCAN")
      const hasSscan = results.some((r) => r.command.name === "SSCAN")
      const hasZscan = results.some((r) => r.command.name === "ZSCAN")

      expect(hasScan || hasHscan || hasSscan || hasZscan).toBe(true)
    })
  })
})
