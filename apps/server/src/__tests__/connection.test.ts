/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, mock, beforeEach } from "node:test"
import assert from "node:assert"
import { GlideClient, GlideClusterClient } from "@valkey/valkey-glide"
import { connectToValkey } from "../connection.ts"
import { VALKEY } from "../../../../common/src/constants.ts"

describe("connectToValkey", () => {
  let mockWs: any
  let messages: string[]
  let clients: Map<string, any>

  beforeEach(() => {
    messages = []
    mockWs = {
      send: mock.fn((msg: string) => messages.push(msg)),
    }
    clients = new Map()
  })

  it("should connect to standalone Valkey instance", async () => {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:0"),
      customCommand: mock.fn(async (args: string[]) => {
        if (
          Array.isArray(args) &&
          args[0] === "CONFIG" &&
          args[1] === "GET" &&
          args[2] === "maxmemory-policy"
        ) {
          return [
            { key: "maxmemory-policy", value: "allkeys-lfu" },
          ]
        }

        // default response for other custom commands
        return []
      }),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async () => mockStandaloneClient as any)

    const payload = {
      host: "127.0.0.1",
      port: 6379,
      connectionId: "conn-123",
    }

    try {
      const result = await connectToValkey(mockWs, payload, clients)

      assert.ok(result)
      assert.strictEqual(clients.get("conn-123"), mockStandaloneClient)
      assert.strictEqual(mockWs.send.mock.calls.length, 1)

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.CONNECTION.standaloneConnectFulfilled)
      assert.strictEqual(sentMessage.payload.connectionId, "conn-123")
      assert.deepStrictEqual(sentMessage.payload.connectionDetails, {
        host: "127.0.0.1",
        port: 6379,
        lfuEnabled: true,
      })
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  })

  it("should connect to cluster when node is part of cluster", async () => {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:1"),
      customCommand: mock.fn(async (args: string[]) => {
        if (
          Array.isArray(args) &&
          args[0] === "CONFIG" &&
          args[1] === "GET" &&
          args[2] === "maxmemory-policy"
        ) {
          return [
            { key: "maxmemory-policy", value: "allkeys-lfu" },
          ]
        }
        return [
          [
            0,
            5460,
            ["192.168.1.1", 6379, "node-1"],
            ["192.168.1.2", 6379, "replica-1"],
          ],
        ]}),
      close: mock.fn(),
    }

    const mockClusterClient = {
      customCommand: mock.fn(),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    const originalCreateClusterClient = GlideClusterClient.createClient

    GlideClient.createClient = mock.fn(async () => mockStandaloneClient as any)
    GlideClusterClient.createClient = mock.fn(async () => mockClusterClient as any)

    const payload = {
      host: "127.0.0.1",
      port: 6379,
      connectionId: "conn-123",
    }

    try {
      const result = await connectToValkey(mockWs, payload, clients)

      assert.ok(result)
      assert.strictEqual(mockStandaloneClient.close.mock.calls.length, 1)
      assert.strictEqual(clients.get("conn-123"), mockClusterClient)

      assert.ok(mockWs.send.mock.calls.length >= 2)

      const parsedMessages = messages.map((msg) => JSON.parse(msg))

      const clusterMessage = parsedMessages.find((msg) => msg.type === VALKEY.CLUSTER.addCluster)
      assert.ok(clusterMessage)
      assert.ok(clusterMessage.payload)
      assert.ok(clusterMessage.payload.clusterNodes)
      assert.ok(clusterMessage.payload.clusterId)

      const clusterConnectMessage = parsedMessages.find((msg) =>
        msg.type === VALKEY.CONNECTION.clusterConnectFulfilled,
      )
      assert.ok(clusterConnectMessage)
      assert.strictEqual(clusterConnectMessage.payload.connectionId, "conn-123")
    } finally {
      GlideClient.createClient = originalCreateClient
      GlideClusterClient.createClient = originalCreateClusterClient
    }
  })

  it("should handle connection errors", async () => {
    const error = new Error("Connection failed")
    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async () => {
      throw error
    })

    const payload = {
      host: "127.0.0.1",
      port: 6379,
      connectionId: "conn-123",
    }

    try {
      const result = await connectToValkey(mockWs, payload, clients)

      assert.strictEqual(result, undefined)
      assert.strictEqual(clients.has("conn-123"), false)
      assert.strictEqual(mockWs.send.mock.calls.length, 1)

      const sentMessage = JSON.parse(messages[0])
      assert.strictEqual(sentMessage.type, VALKEY.CONNECTION.connectRejected)
      assert.strictEqual(sentMessage.payload.connectionId, "conn-123")
      assert.ok(sentMessage.payload.err)
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  })

  it("should use correct client configuration", async () => {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:0"),
      customCommand: mock.fn(),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async (config: any) => {
      assert.ok(config)
      assert.deepStrictEqual(config.addresses, [{ host: "192.168.1.1", port: 7000 }])
      assert.strictEqual(config.requestTimeout, 5000)
      assert.strictEqual(config.clientName, "test_client")
      return mockStandaloneClient as any
    })

    const payload = {
      host: "192.168.1.1",
      port: 7000,
      connectionId: "conn-456",
    }

    try {
      await connectToValkey(mockWs, payload, clients)
      assert.strictEqual((GlideClient.createClient as any).mock.calls.length, 1)
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  })

  it("should store client in clients map with correct connectionId", async () => {
    const mockStandaloneClient = {
      info: mock.fn(async () => "cluster_enabled:0"),
      customCommand: mock.fn(),
      close: mock.fn(),
    }

    const originalCreateClient = GlideClient.createClient
    GlideClient.createClient = mock.fn(async () => mockStandaloneClient as any)

    const payload = {
      host: "127.0.0.1",
      port: 6379,
      connectionId: "unique-conn-id",
    }

    try {
      await connectToValkey(mockWs, payload, clients)

      assert.strictEqual(clients.size, 1)
      assert.ok(clients.has("unique-conn-id"))
      assert.strictEqual(clients.get("unique-conn-id"), mockStandaloneClient)
    } finally {
      GlideClient.createClient = originalCreateClient
    }
  })
})
