import { describe, it, expect } from "vitest"
import { matchCommands, getAllCommands, getCategories } from "../utils/valkey-command-matching"

describe("Valkey Command Matching", () => {
  it("should return empty array for empty query", () => {
    const results = matchCommands("")
    expect(results).toEqual([])
  })

  it("should return empty array for whitespace query", () => {
    const results = matchCommands("   ")
    expect(results).toEqual([])
  })

  it("should find exact prefix matches", () => {
    const results = matchCommands("GET")
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].command.name).toBe("GET")
    expect(results[0].matchType).toBe("prefix")
  })

  it("should prioritize prefix matches over contains matches", () => {
    const results = matchCommands("SET")
    const setCommand = results.find((r) => r.command.name === "SET")
    const hsetCommand = results.find((r) => r.command.name === "HSET")

    expect(setCommand).toBeDefined()
    expect(hsetCommand).toBeDefined()

    if (setCommand && hsetCommand) {
      const setIndex = results.indexOf(setCommand)
      const hsetIndex = results.indexOf(hsetCommand)
      expect(setIndex).toBeLessThan(hsetIndex)
    }
  })

  it("should limit results to maxResults parameter", () => {
    const results = matchCommands("S", 5)
    expect(results.length).toBeLessThanOrEqual(5)
  })

  it("should find contains matches", () => {
    const results = matchCommands("PUSH")
    expect(results.length).toBeGreaterThan(0)

    const lpushResult = results.find((r) => r.command.name === "LPUSH")
    const rpushResult = results.find((r) => r.command.name === "RPUSH")

    expect(lpushResult).toBeDefined()
    expect(rpushResult).toBeDefined()
    expect(lpushResult?.matchType).toBe("contains")
    expect(rpushResult?.matchType).toBe("contains")
  })

  it("should return all commands", () => {
    const commands = getAllCommands()
    expect(commands.length).toBeGreaterThan(0)
    expect(commands[0]).toHaveProperty("name")
    expect(commands[0]).toHaveProperty("syntax")
    expect(commands[0]).toHaveProperty("category")
    expect(commands[0]).toHaveProperty("description")
    expect(commands[0]).toHaveProperty("parameters")
  })

  it("should return available categories", () => {
    const categories = getCategories()
    expect(categories.length).toBeGreaterThan(0)
    expect(categories).toContain("string")
    expect(categories).toContain("hash")
    expect(categories).toContain("list")
  })

  it("should handle case insensitive matching", () => {
    const results = matchCommands("get")
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].command.name).toBe("GET")
  })

  it("should include highlight ranges for matches", () => {
    const results = matchCommands("GET")
    expect(results[0].highlightRanges).toBeDefined()
    expect(results[0].highlightRanges.length).toBeGreaterThan(0)
    expect(results[0].highlightRanges[0]).toEqual([0, 3])
  })
})
