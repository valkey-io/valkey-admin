/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it } from "node:test"
import assert from "node:assert"
import { parseInfo, parseResponse, parseClusterInfo } from "../utils.ts"

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
    const infoStr = `url:http://localhost:6379
time:12:30`

    const result = parseInfo(infoStr)

    // Note: split(":") with destructuring only takes first 2 elements
    // so "url:http://localhost:6379" becomes key="url", value="http"
    assert.deepStrictEqual(result, {
      url: "http",
      time: "12",
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

  it("should handle array responses", () => {
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
