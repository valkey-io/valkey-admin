/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach } from "node:test"
import assert from "node:assert"
import { ConnectionError, TimeoutError, ClosingError } from "@valkey/valkey-glide"
import { sendValkeyRunCommand } from "../sendCommand.ts"
import { VALKEY } from "../../../../common/src/constants.ts"

describe("sendValkeyRunCommand", () => {
  let mockWs: any
  let messages: string[]

  beforeEach(() => {
    messages = []
    mockWs = {
      send: mock.fn((msg: string) => messages.push(msg)),
    }
  })

  it("should send command and return successful response", async () => {
    const mockClient = {
      customCommand: mock.fn(async () => "myvalue"),
    }

    const payload = {
      command: "GET mykey",
      connectionId: "conn-123",
    }

    await sendValkeyRunCommand(mockClient as any, mockWs as any, payload)

    assert.strictEqual(mockClient.customCommand.mock.calls.length, 1)
    assert.deepStrictEqual(mockClient.customCommand.mock.calls[0].arguments, [["GET", "mykey"]])

    assert.strictEqual(mockWs.send.mock.calls.length, 1)
    const sentMessage = JSON.parse(messages[0])
    assert.strictEqual(sentMessage.type, VALKEY.COMMAND.sendFulfilled)
    assert.strictEqual(sentMessage.payload, "myvalue")
    assert.strictEqual(sentMessage.meta.connectionId, "conn-123")
    assert.strictEqual(sentMessage.meta.command, "GET mykey")
  })

  it("should parse string responses with colons", async () => {
    const mockClient = {
      customCommand: mock.fn(async () => "valkey_version:8.0.0\nvalkey_mode:standalone"),
    }

    const payload = {
      command: "INFO",
      connectionId: "conn-123",
    }

    await sendValkeyRunCommand(mockClient as any, mockWs as any, payload)

    const sentMessage = JSON.parse(messages[0])
    assert.strictEqual(sentMessage.type, VALKEY.COMMAND.sendFulfilled)
    assert.deepStrictEqual(sentMessage.payload, {
      valkey_version: "8.0.0",
      valkey_mode: "standalone",
    })
  })

  it("should handle ResponseError in string response", async () => {
    const mockClient = {
      customCommand: mock.fn(async () => "ResponseError: unknown command"),
    }

    const payload = {
      command: "INVALID COMMAND",
      connectionId: "conn-123",
    }

    await sendValkeyRunCommand(mockClient as any, mockWs as any, payload)

    const sentMessage = JSON.parse(messages[0])
    assert.strictEqual(sentMessage.type, VALKEY.COMMAND.sendFailed)
    assert.strictEqual(sentMessage.payload, "ResponseError: unknown command")
  })

  it("should handle array responses", async () => {
    const mockClient = {
      customCommand: mock.fn(async () => ["key1", "key2", "key3"]),
    }

    const payload = {
      command: "KEYS *",
      connectionId: "conn-123",
    }

    await sendValkeyRunCommand(mockClient as any, mockWs as any, payload)

    const sentMessage = JSON.parse(messages[0])
    assert.strictEqual(sentMessage.type, VALKEY.COMMAND.sendFulfilled)
    assert.deepStrictEqual(sentMessage.payload, ["key1", "key2", "key3"])
  })

  it("should handle ConnectionError and send connection rejection", async () => {
    const error = new ConnectionError("Connection lost")
    const mockClient = {
      customCommand: mock.fn(async () => {
        throw error
      }),
    }

    const payload = {
      command: "GET mykey",
      connectionId: "conn-123",
    }

    await sendValkeyRunCommand(mockClient as any, mockWs as any, payload)

    assert.strictEqual(mockWs.send.mock.calls.length, 2)

    const failMessage = JSON.parse(messages[0])
    assert.strictEqual(failMessage.type, VALKEY.COMMAND.sendFailed)

    const rejectMessage = JSON.parse(messages[1])
    assert.strictEqual(rejectMessage.type, VALKEY.CONNECTION.connectRejected)
    assert.strictEqual(rejectMessage.payload.connectionId, "conn-123")
    assert.strictEqual(rejectMessage.payload.errorMessage, "Connection to Valkey instance lost")
  })

  it("should handle TimeoutError and send connection rejection", async () => {
    const error = new TimeoutError("Request timeout")
    const mockClient = {
      customCommand: mock.fn(async () => {
        throw error
      }),
    }

    const payload = {
      command: "GET mykey",
      connectionId: "conn-123",
    }

    await sendValkeyRunCommand(mockClient as any, mockWs as any, payload)

    assert.strictEqual(mockWs.send.mock.calls.length, 2)
    const rejectMessage = JSON.parse(messages[1])
    assert.strictEqual(rejectMessage.type, VALKEY.CONNECTION.connectRejected)
  })

  it("should handle ClosingError and send connection rejection", async () => {
    const error = new ClosingError("Client is closing")
    const mockClient = {
      customCommand: mock.fn(async () => {
        throw error
      }),
    }

    const payload = {
      command: "GET mykey",
      connectionId: "conn-123",
    }

    await sendValkeyRunCommand(mockClient as any, mockWs as any, payload)

    assert.strictEqual(mockWs.send.mock.calls.length, 2)
    const rejectMessage = JSON.parse(messages[1])
    assert.strictEqual(rejectMessage.type, VALKEY.CONNECTION.connectRejected)
  })

  it("should handle generic errors without connection rejection", async () => {
    const error = new Error("Some other error")
    const mockClient = {
      customCommand: mock.fn(async () => {
        throw error
      }),
    }

    const payload = {
      command: "GET mykey",
      connectionId: "conn-123",
    }

    await sendValkeyRunCommand(mockClient as any, mockWs as any, payload)

    assert.strictEqual(mockWs.send.mock.calls.length, 1)
    const sentMessage = JSON.parse(messages[0])
    assert.strictEqual(sentMessage.type, VALKEY.COMMAND.sendFailed)
  })

  it("should split command string into array correctly", async () => {
    const mockClient = {
      customCommand: mock.fn(async () => "OK"),
    }

    const payload = {
      command: "SET mykey myvalue EX 3600",
      connectionId: "conn-123",
    }

    await sendValkeyRunCommand(mockClient as any, mockWs as any, payload)

    assert.deepStrictEqual(mockClient.customCommand.mock.calls[0].arguments, [
      ["SET", "mykey", "myvalue", "EX", "3600"],
    ])
  })
})
