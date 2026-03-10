/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from "node:test"
import assert from "node:assert"
import { parseInfo, parseResponse, parseClusterInfo, isHumanReadable, getHumanReadableElement } from "../utils.ts"

describe("parseInfo", () => {
  it("should parse INFO response string into key-value pairs", () => {
    const infoStr = `# Server
valkey_version:8.0.0
valkey_mode:standalone
os:Linux 5.15.0

# Clients
connected_clients:2
blocked_clients:0`

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
      valkey_mode: "standalone",
      os: "Linux 5.15.0",
      connected_clients: "2",
      blocked_clients: "0",
    })
  })

  it("should skip lines without colons", () => {
    const infoStr = `# Server
valkey_version:8.0.0
invalid line without colon
valkey_mode:standalone`

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
      valkey_mode: "standalone",
    })
  })

  it("should skip comment lines starting with #", () => {
    const infoStr = `# Server
# This is a comment
valkey_version:8.0.0`

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
    })
  })

  it("should handle empty strings", () => {
    const result = parseInfo("")
    assert.deepStrictEqual(result, {})
  })

  it("should trim whitespace from keys and values", () => {
    const infoStr = `  valkey_version  :  8.0.0
  valkey_mode  :  standalone  `

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
      valkey_mode: "standalone",
    })
  })

  it("should handle values with colons by splitting only on first colon", () => {
    const infoStr = "url:http://localhost:6379\r\ntime:12:30"

    const result = parseInfo(infoStr)

    assert.deepStrictEqual(result, {
      url: "http://localhost:6379",
      time: "12:30",
    })
  })
})

describe("parseResponse", () => {
  it("should parse string responses containing colons", () => {
    const response = "valkey_version:8.0.0\nvalkey_mode:standalone"
    const result = parseResponse(response)

    assert.deepStrictEqual(result, {
      valkey_version: "8.0.0",
      valkey_mode: "standalone",
    })
  })

  it("should return original response if no colon present", () => {
    const response = "OK"
    const result = parseResponse(response)

    assert.strictEqual(result, "OK")
  })

  it("should handle non-string responses", () => {
    const response = 123
    const result = parseResponse(response as any)

    assert.strictEqual(result, 123)
  })

  it("should parse fanout responses", () => {
    const response = [
      { key: "localhost:7001", value: "valkey_version:8.0.0\nvalkey_mode:cluster" },
      { key: "localhost:7002", value: "# CPU\nused_cpu_sys:0.1" },
    ]

    const result = parseResponse(response as any)

    assert.deepStrictEqual(result, [
      {
        key: "localhost:7001",
        value: { valkey_version: "8.0.0", valkey_mode: "cluster" },
      },
      {
        key: "localhost:7002",
        value: { used_cpu_sys: "0.1" },
      },
    ])
  })

  it("should return non-fanout arrays unchanged", () => {
    const response = ["key1", "key2"]
    const result = parseResponse(response as any)

    assert.deepStrictEqual(result, ["key1", "key2"])
  })
})

describe("parseClusterInfo", () => {
  it("should parse cluster info response from single host", () => {
    const rawInfo = {
      "192.168.1.1:6379": `# Server\r
valkey_version:8.0.0\r
valkey_mode:cluster\r
\r
# Memory\r
used_memory:1024000`,
    }

    const result = parseClusterInfo(rawInfo)

    const keys = Object.keys(result)
    assert.strictEqual(keys.length, 1)
    const key = keys[0]
    assert.ok(result[key].Server)
    assert.strictEqual(result[key].Server.valkey_version, "8.0.0")
    assert.strictEqual(result[key].Server.valkey_mode, "cluster")
    assert.ok(result[key].Memory)
    assert.strictEqual(result[key].Memory.used_memory, "1024000")
  })

  it("should sanitize host keys", () => {
    const rawInfo = {
      "http://localhost:6379": `# Server\r
valkey_version:8.0.0`,
    }

    const result = parseClusterInfo(rawInfo)

    const keys = Object.keys(result)
    assert.strictEqual(keys.length, 1)
    assert.ok(keys[0].includes("localhost"))
  })

  it("should throw error for invalid input", () => {
    assert.throws(
      () => parseClusterInfo(null as any),
      /Invalid ClusterResponse: expected an object with host keys./,
    )
    assert.throws(() => parseClusterInfo("invalid" as any))
    assert.throws(() => parseClusterInfo(123 as any))
  })
})

describe("isHumanReadable", () => {
  it("should return true for string with 95% printable ratio", () => {
    // 19 printable chars + 1 non-printable = 95% ratio
    const highRatioString = "Hello World Test!!\x00"
    const result = (isHumanReadable as any)(highRatioString)
    assert.strictEqual(result, true) // 95% >= 90% threshold
  })

  it("should return false for string with 85% printable ratio", () => {
    // Need to create string with exactly 85% printable
    // 17 printable + 3 non-printable = 85%
    const lowRatioString = "Hello World Test\x00\x01\x02"
    const result = (isHumanReadable as any)(lowRatioString)
    assert.strictEqual(result, false) // 85% < 90% threshold
  })

  it("should return true for string with exactly 90% printable ratio (boundary)", () => {
    // 9 printable + 1 non-printable = 90%
    const boundaryString = "HelloTest\x00"
    const result = (isHumanReadable as any)(boundaryString)
    assert.strictEqual(result, true) // 90% >= 90% threshold
  })

  it("should return false for string with 89.9% printable ratio (boundary)", () => {
    // Need string where ratio is just below 90%
    // 899 printable + 101 non-printable = 89.9%
    const justBelowString = "A".repeat(899) + "\x00".repeat(101)
    const result = (isHumanReadable as any)(justBelowString)
    assert.strictEqual(result, false) // 89.9% < 90% threshold
  })

  it("should return true for empty string", () => {
    const result = (isHumanReadable as any)("")
    assert.strictEqual(result, true) // Empty string is considered readable
  })

  it("should count tabs as printable", () => {
    const result = (isHumanReadable as any)("Hello\tWorld\t!")
    assert.strictEqual(result, true)
  })

  it("should count line feeds as printable", () => {
    const result = (isHumanReadable as any)("Hello\nWorld\n!")
    assert.strictEqual(result, true)
  })

  it("should count carriage returns as printable", () => {
    const result = (isHumanReadable as any)("Hello\rWorld\r!")
    assert.strictEqual(result, true)
  })

  it("should return true for very long readable string", () => {
    const longString = "A".repeat(10000)
    const result = (isHumanReadable as any)(longString)
    assert.strictEqual(result, true) // 100% printable
  })

  it("should return true for mixed Unicode and ASCII readable", () => {
    const mixedString = "Hello 你好 World!"
    const result = (isHumanReadable as any)(mixedString)
    assert.strictEqual(result, true)
  })

  it("should return true for Chinese characters", () => {
    const result = (isHumanReadable as any)("你好世界")
    assert.strictEqual(result, true)
  })

  it("should return true for Japanese characters", () => {
    const result = (isHumanReadable as any)("こんにちは")
    assert.strictEqual(result, true)
  })

  it("should return true for Korean characters", () => {
    const result = (isHumanReadable as any)("안녕하세요")
    assert.strictEqual(result, true)
  })

  it("should return true for Cyrillic characters", () => {
    const result = (isHumanReadable as any)("Привет мир")
    assert.strictEqual(result, true)
  })

  it("should return true for Arabic characters", () => {
    const result = (isHumanReadable as any)("مرحبا بالعالم")
    assert.strictEqual(result, true)
  })

  it("should return true for accented Latin characters", () => {
    const result = (isHumanReadable as any)("café résumé naïve")
    assert.strictEqual(result, true)
  })

  it("should return true for emoji", () => {
    const result = (isHumanReadable as any)("Hello 🌍🎉👋")
    assert.strictEqual(result, true)
  })

  it("should return false for binary data", () => {
    const binaryData = "\x00\x01\x02\x03\x04\x05\x06\x07"
    const result = (isHumanReadable as any)(binaryData)
    assert.strictEqual(result, false) // 0% printable
  })
})

describe("getHumanReadableElement", () => {
  it("should return original string for human-readable string", () => {
    const readableString = "Hello World!"
    const result = (getHumanReadableElement as any)(readableString)
    assert.strictEqual(result, readableString)
  })

  it("should return 'Not human readable' for non-human-readable string", () => {
    const binaryString = "\x00\x01\x02\x03\x04\x05"
    const result = (getHumanReadableElement as any)(binaryString)
    assert.strictEqual(result, "Not human readable")
  })

  it("should return 'Not human readable' for non-string number", () => {
    const result = (getHumanReadableElement as any)(123)
    assert.strictEqual(result, "Not human readable")
  })

  it("should return 'Not human readable' for non-string null", () => {
    const result = (getHumanReadableElement as any)(null)
    assert.strictEqual(result, "Not human readable")
  })

  it("should recursively process plain objects", () => {
    const result = (getHumanReadableElement as any)({ key: "value" })
    assert.deepStrictEqual(result, { key: "value" })
  })

  it("should filter binary key in {key, value} object", () => {
    const result = (getHumanReadableElement as any)({ key: "\x00\x01\x02binary", value: "1.5" })
    assert.deepStrictEqual(result, { key: "Not human readable", value: 1.5 })
  })

  it("should preserve numeric string values in objects", () => {
    const result = (getHumanReadableElement as any)({ key: "member1", value: "2.5" })
    assert.deepStrictEqual(result, { key: "member1", value: 2.5 })
  })

  it("should preserve number values in objects", () => {
    const result = (getHumanReadableElement as any)({ key: "member1", value: 2.5 })
    assert.deepStrictEqual(result, { key: "member1", value: 2.5 })
  })

  it("should filter non-numeric binary values in objects", () => {
    const result = (getHumanReadableElement as any)({ key: "field", value: "\x00\x01\x02binary" })
    assert.deepStrictEqual(result, { key: "field", value: "Not human readable" })
  })

  it("should handle flat arrays with readable strings", () => {
    const input = ["item1", "item2", "item3"]
    const result = (getHumanReadableElement as any)(input)
    assert.ok(Array.isArray(result))
    assert.deepStrictEqual(result, ["item1", "item2", "item3"])
  })

  it("should filter binary data in flat arrays", () => {
    const binaryData = "test\x00\x01\x02data"
    const input = ["readable", binaryData, "alsoreadable"]
    const result = (getHumanReadableElement as any)(input)
    assert.ok(Array.isArray(result))
    assert.deepStrictEqual(result, ["readable", "Not human readable", "alsoreadable"])
  })

  it("should handle nested arrays (like streams)", () => {
    const input = [
      ["id1", ["field1", "value1"]],
      ["id2", ["field2", "value2"]],
    ]
    const result = (getHumanReadableElement as any)(input)
    assert.ok(Array.isArray(result))
    assert.strictEqual(result.length, 2)
    assert.ok(Array.isArray(result[0]))
    assert.ok(Array.isArray(result[1]))
    assert.deepStrictEqual(result, [
      ["id1", ["field1", "value1"]],
      ["id2", ["field2", "value2"]],
    ])
  })

  it("should filter binary data in nested arrays", () => {
    const binaryData = "test\x00\x01\x02data"
    const input = [
      ["id1", ["readable", binaryData]],
      ["id2", ["field", "value"]],
    ]
    const result = (getHumanReadableElement as any)(input)
    assert.ok(Array.isArray(result))
    const nested = result as any[][]
    assert.strictEqual(nested[0][0], "id1")
    assert.ok(Array.isArray(nested[0][1]))
    assert.strictEqual(nested[0][1][0], "readable")
    assert.strictEqual(nested[0][1][1], "Not human readable")
    assert.strictEqual(nested[1][0], "id2")
    assert.deepStrictEqual(nested[1][1], ["field", "value"])
  })

  it("should handle arrays with non-string primitives", () => {
    const input = ["readable", 123, null, "alsoreadable"]
    const result = (getHumanReadableElement as any)(input)
    assert.ok(Array.isArray(result))
    assert.deepStrictEqual(result, [
      "readable",
      "Not human readable",
      "Not human readable",
      "alsoreadable",
    ])
  })

  it("should handle empty arrays", () => {
    const input: any[] = []
    const result = (getHumanReadableElement as any)(input)
    assert.ok(Array.isArray(result))
    assert.strictEqual(result.length, 0)
  })
})
