import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { GlideClusterClient, type GlideClient } from "@valkey/valkey-glide"
import { KeyScanExpiredError, scanKeyPage } from "../key-pages"

/** Creates distinct keys for scan batches that cross page boundaries. */
const names = (count: number) => Array.from({ length: count }, (_, i) => `key:${i}`)

describe("key scan pages", () => {
  it("supports a browsing pause and identifies expired scans", async (context) => {
    let now = Date.now()
    context.mock.method(Date, "now", () => now)
    const client = { customCommand: async () => ["0", names(450)] } as unknown as GlideClient
    const owner = {}
    const first = await scanKeyPage(client, owner, { connectionId: "db0" })
    now += 6 * 60 * 1000
    const request = { connectionId: "db0", cursor: first.cursor }
    assert.equal((await scanKeyPage(client, owner, request)).keys.length, 200)
    now += 31 * 60 * 1000
    await assert.rejects(scanKeyPage(client, owner, request), KeyScanExpiredError)
    assert.equal((await scanKeyPage(client, owner, { connectionId: "db0" })).keys.length, 200)
  })
  it("preserves oversized batches and reaches beyond 1,000 keys", async () => {
    const client = { customCommand: async () => ["0", names(1205)] } as unknown as GlideClient
    const owner = {}
    const found = new Set<string>()
    let cursor = "0"
    do {
      const page = await scanKeyPage(client, owner, { connectionId: "db0", cursor })
      assert.ok(page.keys.length <= 200)
      page.keys.forEach((key) => found.add(key))
      cursor = page.cursor
    } while (cursor !== "0")
    assert.equal(found.size, 1205)
  })

  it("bounds empty scans without falsely reporting completion", async () => {
    let calls = 0
    const client = { customCommand: async () => { calls++; return ["1", []] } } as unknown as GlideClient
    const page = await scanKeyPage(client, {}, { connectionId: "db0", pattern: "rare*" })
    assert.equal(calls, 9)
    assert.deepEqual(page.keys, [])
    assert.notEqual(page.cursor, "0")
  })

  it("applies search and type before enrichment and deduplicates names", async () => {
    const client = { customCommand: async (args: string[]) => {
      assert.deepEqual(args, ["SCAN", "0", "MATCH", "user:*", "COUNT", "200", "TYPE", "hash"])
      return ["0", ["user:z", "user:a", "user:a"]]
    } } as unknown as GlideClient
    const page = await scanKeyPage(client, {}, { connectionId: "db0", pattern: "user:*", keyType: "hash" })
    assert.deepEqual(page.keys, ["user:a", "user:z"])
    assert.equal(page.cursor, "0")
  })

  it("isolates continuations and allows a safe retry", async () => {
    const client = { customCommand: async () => ["0", names(450)] } as unknown as GlideClient
    const owner = {}
    const first = await scanKeyPage(client, owner, { connectionId: "db0" })
    const request = { connectionId: "db0", cursor: first.cursor }
    const second = await scanKeyPage(client, owner, request)
    assert.deepEqual((await scanKeyPage(client, owner, request)).keys, second.keys)
    await assert.rejects(scanKeyPage(client, {}, request), /expired or changed/)
    await assert.rejects(scanKeyPage(client, owner, { ...request, connectionId: "db1" }), /expired or changed/)
    await assert.rejects(scanKeyPage(client, owner, { ...request, pattern: "other*" }), /expired or changed/)
    await assert.rejects(scanKeyPage({} as GlideClient, owner, request), /expired or changed/)
  })

  it("preserves progress on every cluster primary", async () => {
    const client = Object.create(GlideClusterClient.prototype) as GlideClusterClient
    client.customCommand = async (args, options) => {
      if (args[5] === "1") {
        assert.equal(options?.route, "allPrimaries")
        return [
          { key: "127.0.0.1:7001", value: ["1", ["probe-only"]] },
          { key: "127.0.0.1:7002", value: ["0", []] },
        ]
      }
      if (options?.route === "allPrimaries") return [
        { key: "127.0.0.1:7001", value: ["1", names(250)] },
        { key: "127.0.0.1:7002", value: ["0", ["other"]] },
      ]
      assert.deepEqual(options?.route, { type: "routeByAddress", host: "127.0.0.1", port: 7001 })
      return ["0", ["last"]]
    }
    const owner = {}
    const found = new Set<string>()
    let cursor = "0"
    do {
      const page = await scanKeyPage(client, owner, { connectionId: "cluster", cursor })
      page.keys.forEach((key) => found.add(key))
      cursor = page.cursor
    } while (cursor !== "0")
    assert.equal(found.size, 252)
    assert.ok(found.has("last") && found.has("other"))
  })

  it("requires a restart when a saved primary is replaced, including buffered keys", async () => {
    const client = Object.create(GlideClusterClient.prototype) as GlideClusterClient
    let address = "127.0.0.1:7001"
    client.customCommand = async (args, options) => {
      assert.equal(options?.route, "allPrimaries")
      return [{ key: address, value: args[5] === "1" ? ["1", ["probe-only"]] : ["0", names(250)] }]
    }
    const owner = {}
    const first = await scanKeyPage(client, owner, { connectionId: "cluster" })
    address = "127.0.0.1:7002"
    await assert.rejects(scanKeyPage(client, owner, {
      connectionId: "cluster", cursor: first.cursor,
    }), KeyScanExpiredError)
    const restarted = await scanKeyPage(client, owner, { connectionId: "cluster" })
    assert.equal(restarted.keys.length, 200)
    const last = await scanKeyPage(client, owner, { connectionId: "cluster", cursor: restarted.cursor })
    assert.equal(last.keys.length, 50)
    assert.equal(last.cursor, "0")
  })

  it("preserves ordinary command failures and allows retrying the same continuation", async () => {
    const client = Object.create(GlideClusterClient.prototype) as GlideClusterClient
    const failure = new Error("Connection temporarily unavailable")
    let fail = false
    client.customCommand = async (args, options) => {
      assert.equal(options?.route, "allPrimaries")
      if (args[5] === "1" && fail) throw failure
      return [{ key: "127.0.0.1:7001", value: args[5] === "1" ? ["1", ["probe-only"]] : ["0", names(250)] }]
    }
    const owner = {}
    const first = await scanKeyPage(client, owner, { connectionId: "cluster" })
    const request = { connectionId: "cluster", cursor: first.cursor }
    fail = true
    await assert.rejects(scanKeyPage(client, owner, request), (error) => error === failure)
    fail = false
    const retried = await scanKeyPage(client, owner, request)
    assert.equal(retried.keys.length, 50)
    assert.equal(retried.cursor, "0")
  })
})
