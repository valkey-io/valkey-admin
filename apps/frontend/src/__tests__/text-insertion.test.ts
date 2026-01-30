import { describe, it, expect } from "vitest"
import type { ValkeyCommand } from "@/types/valkey-commands"
import { insertCommandIntoText, extractCommandFromText } from "@/utils/text-insertion"

describe("text-insertion", () => {
  describe("extractCommandFromText", () => {
    it("should extract command from simple text", () => {
      const result = extractCommandFromText("GET", 3)
      expect(result).toBe("GET")
    })

    it("should extract partial command", () => {
      const result = extractCommandFromText("GE", 2)
      expect(result).toBe("GE")
    })

    it("should extract command with arguments", () => {
      const result = extractCommandFromText("GET mykey", 3)
      expect(result).toBe("GET")
    })

    it("should extract command from multi-line text", () => {
      const result = extractCommandFromText("SET key1 value1\nGET", 19)
      expect(result).toBe("GET")
    })

    it("should handle whitespace before command", () => {
      const result = extractCommandFromText("  GET", 5)
      expect(result).toBe("GET")
    })

    it("should return empty string for empty text", () => {
      const result = extractCommandFromText("", 0)
      expect(result).toBe("")
    })
  })

  describe("insertCommandIntoText", () => {
    const getCommand: ValkeyCommand = {
      name: "GET",
      syntax: "GET key",
      category: "string",
      description: "Get the value of a key",
      parameters: [{ name: "key", type: "key", required: true, placeholder: "key" }],
      tier: "read",
    }

    const pingCommand: ValkeyCommand = {
      name: "PING",
      syntax: "PING",
      category: "connection",
      description: "Ping the server",
      parameters: [],
      tier: "read",
    }

    it("should insert command without placeholder", () => {
      const result = insertCommandIntoText("G", 1, getCommand)
      expect(result.newText).toBe("GET")
      expect(result.newCursorPosition).toBe(3)
    })

    it("should preserve existing arguments", () => {
      const result = insertCommandIntoText("G mykey", 1, getCommand)
      expect(result.newText).toBe("GET mykey")
      expect(result.newCursorPosition).toBe(9)
    })

    it("should insert command without parameters", () => {
      const result = insertCommandIntoText("PIN", 3, pingCommand)
      expect(result.newText).toBe("PING")
      expect(result.newCursorPosition).toBe(4)
    })

    it("should handle multi-line text", () => {
      const result = insertCommandIntoText("SET key1 value1\nG", 17, getCommand)
      expect(result.newText).toBe("SET key1 value1\nGET")
      expect(result.newCursorPosition).toBe(19)
    })

    it("should handle whitespace before command", () => {
      const result = insertCommandIntoText("  G", 3, getCommand)
      expect(result.newText).toBe("  GET")
      expect(result.newCursorPosition).toBe(5)
    })

    it("should replace partial command on same line", () => {
      const result = insertCommandIntoText("GE", 2, getCommand)
      expect(result.newText).toBe("GET")
      expect(result.newCursorPosition).toBe(3)
    })
  })
})
