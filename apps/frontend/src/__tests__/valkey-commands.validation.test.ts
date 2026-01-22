import { describe, it, expect } from "vitest"
import valkeyCommands from "../data/valkey-commands.json"
import type { ValkeyCommand } from "@/types/valkey-commands"

describe("Valkey Command Database Validation", () => {
  const commands = valkeyCommands as ValkeyCommand[]

  it("should have all required fields for every command", () => {
    commands.forEach((command) => {
      expect(command).toHaveProperty("name")
      expect(command).toHaveProperty("syntax")
      expect(command).toHaveProperty("category")
      expect(command).toHaveProperty("description")
      expect(command).toHaveProperty("parameters")
      expect(command).toHaveProperty("tier")

      expect(typeof command.name).toBe("string")
      expect(typeof command.syntax).toBe("string")
      expect(typeof command.category).toBe("string")
      expect(typeof command.description).toBe("string")
      expect(Array.isArray(command.parameters)).toBe(true)
      expect(["default", "remediation", "admin"]).toContain(command.tier)
    })
  })

  it("should have non-empty name, syntax, and description", () => {
    commands.forEach((command) => {
      expect(command.name.length).toBeGreaterThan(0)
      expect(command.syntax.length).toBeGreaterThan(0)
      expect(command.description.length).toBeGreaterThan(0)
    })
  })

  it("should have valid categories", () => {
    const validCategories = [
      "connection",
      "server",
      "generic",
      "string",
      "hash",
      "list",
      "set",
      "sorted_set",
      "scan",
      "admin",
    ]

    commands.forEach((command) => {
      expect(validCategories).toContain(command.category)
    })
  })

  it("should have required parameters present in syntax", () => {
    commands.forEach((command) => {
      const requiredParams = command.parameters.filter((p) => p.required)

      requiredParams.forEach((param) => {
        // Check if either the parameter name or a generic version is in the syntax
        const paramName = param.name
        const paramInSyntax = command.syntax.includes(paramName) ||
                             command.syntax.includes(param.placeholder || param.name)
        if (!paramInSyntax) {
          console.log(`Command: ${command.name}, Missing param: ${param.name} (placeholder: ${param.placeholder}), Syntax: ${command.syntax}`)
        }
        expect(paramInSyntax).toBe(true)
      })
    })
  })

  it("should show repeatable parameters with [...] in syntax", () => {
    commands.forEach((command) => {
      const repeatableParams = command.parameters.filter((p) => p.repeatable)

      repeatableParams.forEach((param) => {
        const placeholder = param.placeholder || param.name
        const hasRepeatableSyntax =
          command.syntax.includes(`${placeholder} [${placeholder} ...]`) ||
          command.syntax.includes(`[${placeholder} ...]`)

        expect(hasRepeatableSyntax).toBe(true)
      })
    })
  })

  it("should have valid parameter types", () => {
    const validTypes = ["key", "value", "option", "number", "pattern", "cursor"]

    commands.forEach((command) => {
      command.parameters.forEach((param) => {
        expect(validTypes).toContain(param.type)
      })
    })
  })

  it("should have proper tier distribution", () => {
    const defaultCommands = commands.filter((c) => c.tier === "default")
    const remediationCommands = commands.filter((c) => c.tier === "remediation")
    const adminCommands = commands.filter((c) => c.tier === "admin")

    // Should have commands in each tier
    expect(defaultCommands.length).toBeGreaterThan(0)
    expect(remediationCommands.length).toBeGreaterThan(0)
    expect(adminCommands.length).toBeGreaterThan(0)

    // Default tier should have the most commands (inspection/exploration)
    expect(defaultCommands.length).toBeGreaterThanOrEqual(remediationCommands.length)
  })

  it("should have dangerous commands in admin tier", () => {
    const dangerousCommands = ["FLUSHDB", "FLUSHALL", "CONFIG SET"]

    dangerousCommands.forEach((cmdName) => {
      const command = commands.find((c) => c.name === cmdName)
      if (command) {
        expect(command.tier).toBe("admin")
      }
    })
  })

  it("should have UNLINK in remediation tier (safer than DEL)", () => {
    const unlink = commands.find((c) => c.name === "UNLINK")
    expect(unlink).toBeDefined()
    expect(unlink?.tier).toBe("remediation")
  })

  it("should have inspection commands in default tier", () => {
    const inspectionCommands = ["GET", "HGET", "LRANGE", "SMEMBERS", "ZRANGE", "TYPE", "TTL", "SCAN"]

    inspectionCommands.forEach((cmdName) => {
      const command = commands.find((c) => c.name === cmdName)
      if (command) {
        expect(command.tier).toBe("default")
      }
    })
  })

  it("should have unique command names", () => {
    const names = commands.map((c) => c.name)
    const uniqueNames = new Set(names)
    expect(names.length).toBe(uniqueNames.size)
  })

  it("should have uppercase command names", () => {
    commands.forEach((command) => {
      expect(command.name).toBe(command.name.toUpperCase())
    })
  })

  it("should have syntax starting with command name", () => {
    commands.forEach((command) => {
      expect(command.syntax.startsWith(command.name)).toBe(true)
    })
  })
})
