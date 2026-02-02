/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach } from "node:test"
import assert from "node:assert"
import { ConnectionError } from "@valkey/valkey-glide"
import { getKeyInfo, deleteKey, addKey, getKeyInfoSingle } from "../keys-browser.ts"
import { VALKEY } from "../../../../common/src/constants.ts"

// Test helper functions
function createMockWs() {
  const messages: string[] = []
  const mockWs = {
    send: mock.fn((msg: string) => messages.push(msg)),
  }
  return { mockWs, messages }
}

function createMockClient(responses: Record<string, any>) {
  return {
    customCommand: mock.fn(async (cmd: string[]) => {
      const key = cmd[0]
      return responses[key] ?? null
    }),
  }
}

function getMessageOfType(messages: string[], type: string) {
  return messages.map((msg) => JSON.parse(msg)).find((msg) => msg.type === type)
}

describe("getKeyInfo", () => {
  describe("string keys", () => {
    it("should get string key info", async () => {
      const mockClient = createMockClient({
        TYPE: "string",
        TTL: 3600,
        MEMORY: 100,
        GET: "myvalue",
      })

      const result = await getKeyInfo(mockClient as any, "mykey")

      assert.strictEqual(result.name, "mykey")
      assert.strictEqual(result.type, "string")
      assert.strictEqual(result.ttl, 3600)
      assert.strictEqual(result.size, 100)
      assert.strictEqual(result.elements, "myvalue")
    })

    it("should handle null memory usage", async () => {
      const mockClient = createMockClient({
        TYPE: "string",
        TTL: -1,
        MEMORY: null,
        GET: "value",
      })

      const result = await getKeyInfo(mockClient as any, "mykey")

      assert.strictEqual(result.size, 0)
    })
  })

  describe("hash keys", () => {
    it("should get hash key info", async () => {
      const mockClient = createMockClient({
        TYPE: "hash",
        TTL: -1,
        MEMORY: 200,
        HLEN: 3,
        HGETALL: ["field1", "value1", "field2", "value2"],
      })

      const result = await getKeyInfo(mockClient as any, "myhash")

      assert.strictEqual(result.name, "myhash")
      assert.strictEqual(result.type, "hash")
      assert.strictEqual(result.ttl, -1)
      assert.strictEqual(result.size, 200)
      assert.strictEqual(result.collectionSize, 3)
      assert.deepStrictEqual(result.elements, ["field1", "value1", "field2", "value2"])
    })
  })

  describe("list keys", () => {
    it("should get list key info", async () => {
      const mockClient = createMockClient({
        TYPE: "list",
        TTL: 0,
        MEMORY: 150,
        LLEN: 2,
        LRANGE: ["item1", "item2"],
      })

      const result = await getKeyInfo(mockClient as any, "mylist")

      assert.strictEqual(result.name, "mylist")
      assert.strictEqual(result.type, "list")
      assert.strictEqual(result.collectionSize, 2)
      assert.deepStrictEqual(result.elements, ["item1", "item2"])
    })
  })

  describe("error handling", () => {
    it("should handle errors gracefully", async () => {
      const mockClient = {
        customCommand: mock.fn(async () => {
          throw new Error("Connection error")
        }),
      }

      const result = await getKeyInfo(mockClient as any, "failkey")

      assert.strictEqual(result.name, "failkey")
      assert.strictEqual(result.type, "unknown")
      assert.strictEqual(result.ttl, -1)
      assert.strictEqual(result.size, 0)
    })
  })
})

describe("deleteKey", () => {
  let mockWs: any
  let messages: string[]

  beforeEach(() => {
    const result = createMockWs()
    mockWs = result.mockWs
    messages = result.messages
  })

  describe("successful deletion", () => {
    it("should successfully delete a key", async () => {
      const mockClient = {
        customCommand: mock.fn(async () => 1),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
      }

      await deleteKey(mockClient as any, mockWs, payload)

      assert.strictEqual(mockClient.customCommand.mock.calls.length, 1)
      assert.deepStrictEqual(mockClient.customCommand.mock.calls[0].arguments, [
        ["UNLINK", "mykey"],
      ])

      assert.strictEqual(mockWs.send.mock.calls.length, 1)
      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.KEYS.deleteKeyFulfilled)
      assert.strictEqual(sentMessage.payload.key, "mykey")
      assert.strictEqual(sentMessage.payload.deleted, true)
    })

    it("should handle key not found", async () => {
      const mockClient = {
        customCommand: mock.fn(async () => 0),
      }

      const payload = {
        connectionId: "conn-123",
        key: "nonexistent",
      }

      await deleteKey(mockClient as any, mockWs, payload)

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.payload.deleted, false)
    })
  })

  describe("error handling", () => {
    it("should handle deletion errors", async () => {
      const mockClient = {
        customCommand: mock.fn(async () => {
          throw new ConnectionError("Delete failed")
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
      }

      await deleteKey(mockClient as any, mockWs, payload)

      assert.ok(mockWs.send.mock.calls.length >= 2)
      const failMessage = getMessageOfType(messages, VALKEY.KEYS.deleteKeyFailed)
      assert.ok(failMessage)

      const rejectMessage = getMessageOfType(messages, VALKEY.CONNECTION.connectRejected)
      assert.ok(rejectMessage)
    })
  })
})

describe("addKey", () => {
  let mockWs: any
  let messages: string[]

  beforeEach(() => {
    const result = createMockWs()
    mockWs = result.mockWs
    messages = result.messages
  })

  describe("string keys", () => {
    it("should add a string key", async () => {
      const mockClient = {
        customCommand: mock.fn(async (cmd: string[]) => {
          if (cmd[0] === "SET") return "OK"
          if (cmd[0] === "TYPE") return "string"
          if (cmd[0] === "TTL") return -1
          if (cmd[0] === "MEMORY") return 50
          if (cmd[0] === "GET") return "myvalue"
          return null
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
        keyType: "string",
        value: "myvalue",
      }

      await addKey(mockClient as any, mockWs, payload)

      const setCalls = mockClient.customCommand.mock.calls.filter(
        (call: any) => call.arguments[0][0] === "SET",
      )
      assert.strictEqual(setCalls.length, 1)
      assert.deepStrictEqual(setCalls[0].arguments, [["SET", "mykey", "myvalue"]])

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.KEYS.addKeyFulfilled)
      assert.strictEqual(sentMessage.payload.key.name, "mykey")
    })

    it("should add a string key with TTL", async () => {
      const mockClient = {
        customCommand: mock.fn(async (cmd: string[]) => {
          if (cmd[0] === "SETEX") return "OK"
          if (cmd[0] === "TYPE") return "string"
          if (cmd[0] === "TTL") return 3600
          if (cmd[0] === "MEMORY") return 50
          if (cmd[0] === "GET") return "myvalue"
          return null
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
        keyType: "string",
        value: "myvalue",
        ttl: 3600,
      }

      await addKey(mockClient as any, mockWs, payload)

      const setexCalls = mockClient.customCommand.mock.calls.filter(
        (call: any) => call.arguments[0][0] === "SETEX",
      )
      assert.strictEqual(setexCalls.length, 1)
      assert.deepStrictEqual(setexCalls[0].arguments, [["SETEX", "mykey", "3600", "myvalue"]])
    })
  })

  describe("hash keys", () => {
    it("should add a hash key", async () => {
      const mockClient = {
        customCommand: mock.fn(async (cmd: string[]) => {
          if (cmd[0] === "HSET") return 2
          if (cmd[0] === "TYPE") return "hash"
          if (cmd[0] === "TTL") return -1
          if (cmd[0] === "MEMORY") return 100
          if (cmd[0] === "HLEN") return 2
          if (cmd[0] === "HGETALL") return ["field1", "value1", "field2", "value2"]
          return null
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "myhash",
        keyType: "hash",
        fields: [
          { field: "field1", value: "value1" },
          { field: "field2", value: "value2" },
        ],
      }

      await addKey(mockClient as any, mockWs, payload)

      const hsetCalls = mockClient.customCommand.mock.calls.filter(
        (call: any) => call.arguments[0][0] === "HSET",
      )
      assert.strictEqual(hsetCalls.length, 1)
      assert.deepStrictEqual(hsetCalls[0].arguments, [
        ["HSET", "myhash", "field1", "value1", "field2", "value2"],
      ])
    })
  })

  describe("list keys", () => {
    it("should add a list key", async () => {
      const mockClient = {
        customCommand: mock.fn(async (cmd: string[]) => {
          if (cmd[0] === "RPUSH") return 3
          if (cmd[0] === "TYPE") return "list"
          if (cmd[0] === "TTL") return -1
          if (cmd[0] === "MEMORY") return 75
          if (cmd[0] === "LLEN") return 3
          if (cmd[0] === "LRANGE") return ["item1", "item2", "item3"]
          return null
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mylist",
        keyType: "list",
        values: ["item1", "item2", "item3"],
      }

      await addKey(mockClient as any, mockWs, payload)

      const rpushCalls = mockClient.customCommand.mock.calls.filter(
        (call: any) => call.arguments[0][0] === "RPUSH",
      )
      assert.strictEqual(rpushCalls.length, 1)
      assert.deepStrictEqual(rpushCalls[0].arguments, [
        ["RPUSH", "mylist", "item1", "item2", "item3"],
      ])
    })
  })

  describe("set keys", () => {
    it("should add a set key", async () => {
      const mockClient = {
        customCommand: mock.fn(async (cmd: string[]) => {
          if (cmd[0] === "SADD") return 2
          if (cmd[0] === "TYPE") return "set"
          if (cmd[0] === "TTL") return -1
          if (cmd[0] === "MEMORY") return 60
          if (cmd[0] === "SCARD") return 2
          if (cmd[0] === "SMEMBERS") return ["member1", "member2"]
          return null
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "myset",
        keyType: "set",
        values: ["member1", "member2"],
      }

      await addKey(mockClient as any, mockWs, payload)

      const saddCalls = mockClient.customCommand.mock.calls.filter(
        (call: any) => call.arguments[0][0] === "SADD",
      )
      assert.strictEqual(saddCalls.length, 1)
      assert.deepStrictEqual(saddCalls[0].arguments, [
        ["SADD", "myset", "member1", "member2"],
      ])
    })
  })

  describe("error handling", () => {
    it("should handle missing value for string type", async () => {
      const mockClient = {
        customCommand: mock.fn(),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
        keyType: "string",
      }

      await addKey(mockClient as any, mockWs, payload)

      const failMessage = JSON.parse(messages[0])
      assert.strictEqual(failMessage.type, VALKEY.KEYS.addKeyFailed)
      assert.ok(failMessage.payload.error.includes("Value is required"))
    })

    it("should handle unsupported key type", async () => {
      const mockClient = {
        customCommand: mock.fn(),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
        keyType: "unsupported",
        value: "test",
      }

      await addKey(mockClient as any, mockWs, payload)

      const failMessage = JSON.parse(messages[0])
      assert.strictEqual(failMessage.type, VALKEY.KEYS.addKeyFailed)
      assert.ok(failMessage.payload.error.includes("Unsupported key type"))
    })
  })
})

describe("updateKey", () => {
  let mockWs: any
  let messages: string[]

  beforeEach(() => {
    const result = createMockWs()
    mockWs = result.mockWs
    messages = result.messages
  })

  describe("string keys", () => {
    it("should update a string key", async () => {
      const mockClient = {
        customCommand: mock.fn(async (cmd: string[]) => {
          if (cmd[0] === "SET") return "OK"
          if (cmd[0] === "TYPE") return "string"
          if (cmd[0] === "TTL") return -1
          if (cmd[0] === "MEMORY") return 50
          if (cmd[0] === "GET") return "newvalue"
          return null
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
        keyType: "string",
        value: "newvalue",
      }

      await import("../keys-browser.ts").then((m) => m.updateKey(mockClient as any, mockWs, payload))

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.KEYS.updateKeyFulfilled)
      assert.strictEqual(sentMessage.payload.key.name, "mykey")
      assert.strictEqual(sentMessage.payload.message, "Key updated successfully")
    })
  })

  describe("hash keys", () => {
    it("should update a hash key", async () => {
      const mockClient = {
        customCommand: mock.fn(async (cmd: string[]) => {
          if (cmd[0] === "HSET") return 2
          if (cmd[0] === "TYPE") return "hash"
          if (cmd[0] === "TTL") return -1
          if (cmd[0] === "MEMORY") return 100
          if (cmd[0] === "HLEN") return 2
          if (cmd[0] === "HGETALL") return ["field1", "newvalue1", "field2", "newvalue2"]
          return null
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "myhash",
        keyType: "hash",
        fields: [
          { field: "field1", value: "newvalue1" },
          { field: "field2", value: "newvalue2" },
        ],
      }

      await import("../keys-browser.ts").then((m) => m.updateKey(mockClient as any, mockWs, payload))

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.KEYS.updateKeyFulfilled)
    })
  })

  describe("error handling", () => {
    it("should handle missing value for string type", async () => {
      const mockClient = {
        customCommand: mock.fn(),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
        keyType: "string",
      }

      await import("../keys-browser.ts").then((m) => m.updateKey(mockClient as any, mockWs, payload))

      const failMessage = JSON.parse(messages[0])
      assert.strictEqual(failMessage.type, VALKEY.KEYS.updateKeyFailed)
      assert.ok(failMessage.payload.error.includes("Value is required"))
    })

    it("should handle update errors", async () => {
      const mockClient = {
        customCommand: mock.fn(async () => {
          throw new ConnectionError("Delete failed")
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
        keyType: "string",
        value: "newvalue",
      }

      await import("../keys-browser.ts").then((m) => m.updateKey(mockClient as any, mockWs, payload))

      assert.ok(mockWs.send.mock.calls.length >= 2)
      const failMessage = getMessageOfType(messages, VALKEY.KEYS.updateKeyFailed)
      assert.ok(failMessage)

      const rejectMessage = getMessageOfType(messages, VALKEY.CONNECTION.connectRejected)
      assert.ok(rejectMessage)
    })
  })
})

describe("getKeys", () => {
  let mockWs: any
  let messages: string[]

  beforeEach(() => {
    const result = createMockWs()
    mockWs = result.mockWs
    messages = result.messages
  })

  describe("successful retrieval", () => {
    it("should get all keys successfully", async () => {
      const mockClient = {
        customCommand: mock.fn(async (cmd: string[]) => {
          if (cmd[0] === "SCAN") return ["0", ["key1", "key2"]]
          if (cmd[0] === "TYPE") return "string"
          if (cmd[0] === "TTL") return -1
          if (cmd[0] === "MEMORY") return 50
          if (cmd[0] === "GET") return "value"
          return null
        }),
        instanceof: () => false, // Standalone client
      }

      const payload = {
        connectionId: "conn-123",
        pattern: "*",
        count: 100,
      }

      await import("../keys-browser.ts").then((m) => m.getKeys(mockClient as any, mockWs, payload))

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.KEYS.getKeysFulfilled)
      assert.strictEqual(sentMessage.payload.connectionId, "conn-123")
      assert.ok(Array.isArray(sentMessage.payload.keys))
    })
  })

  describe("error handling", () => {
    it("should handle errors when getting keys", async () => {
      const mockClient = {
        customCommand: mock.fn(async () => {
          throw new ConnectionError("Get failed")
        }),
        instanceof: () => false,
      }

      const payload = {
        connectionId: "conn-123",
      }

      await import("../keys-browser.ts").then((m) => m.getKeys(mockClient as any, mockWs, payload))

      assert.ok(mockWs.send.mock.calls.length >= 2)
      const failMessage = getMessageOfType(messages, VALKEY.KEYS.getKeysFailed)
      assert.ok(failMessage)

      const rejectMessage = getMessageOfType(messages, VALKEY.CONNECTION.connectRejected)
      assert.ok(rejectMessage)
      assert.strictEqual(rejectMessage.payload.errorMessage, "Error getting keys - Valkey instance could be down")
    })
  })
})

describe("getKeyInfoSingle", () => {
  let mockWs: any
  let messages: string[]

  beforeEach(() => {
    const result = createMockWs()
    mockWs = result.mockWs
    messages = result.messages
  })

  describe("successful retrieval", () => {
    it("should get single key info successfully", async () => {
      const mockClient = createMockClient({
        TYPE: "string",
        TTL: 3600,
        MEMORY: 100,
        GET: "myvalue",
      })

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
      }

      await import("../keys-browser.ts").then((m) => m.getKeyInfoSingle(mockClient as any, mockWs, payload))

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.KEYS.getKeyTypeFulfilled)
      assert.strictEqual(sentMessage.payload.connectionId, "conn-123")
      assert.strictEqual(sentMessage.payload.key, "mykey")
      assert.strictEqual(sentMessage.payload.name, "mykey")
      assert.strictEqual(sentMessage.payload.type, "string")
      assert.strictEqual(sentMessage.payload.ttl, 3600)
    })
  })

  describe("error handling", () => {
    it("should handle errors when getting key info", async () => {
      const mockClient = {
        customCommand: mock.fn(async () => {
          throw new Error("TYPE failed")
        }),
      }

      const payload = {
        connectionId: "conn-123",
        key: "mykey",
      }

      await getKeyInfoSingle(mockClient as any, mockWs, payload)

      assert.strictEqual(mockWs.send.mock.calls.length, 1)
      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.KEYS.getKeyTypeFulfilled)
      assert.strictEqual(sentMessage.payload.connectionId, "conn-123")
      assert.strictEqual(sentMessage.payload.key, "mykey")
      assert.strictEqual(sentMessage.payload.type, "unknown")
      assert.strictEqual(sentMessage.payload.ttl, -1)
      assert.strictEqual(sentMessage.payload.size, 0)
    })
  })
})
