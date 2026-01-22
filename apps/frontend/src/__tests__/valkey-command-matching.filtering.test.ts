import { describe, it, expect } from "vitest"
import {
  getCommands,
  searchCommands,
  getCommandsByTier,
  matchCommands
} from "../utils/valkey-command-matching"

describe("Valkey Command Filtering", () => {
  describe("getCommands", () => {
    it("should return only default and remediation commands when adminMode is false", () => {
      const commands = getCommands({ adminMode: false })

      commands.forEach((command) => {
        expect(["default", "remediation"]).toContain(command.tier)
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
        expect(["default", "remediation"]).toContain(command.tier)
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

  describe("getCommandsByTier", () => {
    it("should return only default tier commands", () => {
      const commands = getCommandsByTier("default")

      commands.forEach((command) => {
        expect(command.tier).toBe("default")
      })

      expect(commands.length).toBeGreaterThan(0)
    })

    it("should return only remediation tier commands", () => {
      const commands = getCommandsByTier("remediation")

      commands.forEach((command) => {
        expect(command.tier).toBe("remediation")
      })

      expect(commands.length).toBeGreaterThan(0)
    })

    it("should return only admin tier commands", () => {
      const commands = getCommandsByTier("admin")

      commands.forEach((command) => {
        expect(command.tier).toBe("admin")
      })

      expect(commands.length).toBeGreaterThan(0)
    })

    it("should have FLUSHDB and FLUSHALL in admin tier", () => {
      const adminCommands = getCommandsByTier("admin")

      const hasFlushDb = adminCommands.some((c) => c.name === "FLUSHDB")
      const hasFlushAll = adminCommands.some((c) => c.name === "FLUSHALL")

      expect(hasFlushDb).toBe(true)
      expect(hasFlushAll).toBe(true)
    })

    it("should have inspection commands in default tier", () => {
      const defaultCommands = getCommandsByTier("default")

      const hasGet = defaultCommands.some((c) => c.name === "GET")
      const hasScan = defaultCommands.some((c) => c.name === "SCAN")
      const hasType = defaultCommands.some((c) => c.name === "TYPE")

      expect(hasGet).toBe(true)
      expect(hasScan).toBe(true)
      expect(hasType).toBe(true)
    })

    it("should have UNLINK in remediation tier", () => {
      const remediationCommands = getCommandsByTier("remediation")

      const hasUnlink = remediationCommands.some((c) => c.name === "UNLINK")

      expect(hasUnlink).toBe(true)
    })
  })
})
