import { describe, it } from "node:test"
import assert from "node:assert"
import { parseTargets, targetFromPath } from "../targets"

const credentials = { username: "mcp_readonly", password: "secret" }

describe("parseTargets", () => {
  it("parses host:port entries with the shared credentials", () => {
    const targets = parseTargets("prod=valkey-prod:6380,cache=10.0.0.5:7001", credentials)

    assert.deepStrictEqual(targets.get("prod"), { host: "valkey-prod", port: 6380, ...credentials, useTLS: false })
    assert.deepStrictEqual(targets.get("cache"), { host: "10.0.0.5", port: 7001, ...credentials, useTLS: false })
  })

  it("defaults the port to 6379", () => {
    assert.strictEqual(parseTargets("prod=valkey-prod", credentials).get("prod")?.port, 6379)
  })

  it("uses TLS for valkeys:// and not for valkey://", () => {
    const targets = parseTargets("secure=valkeys://a:6380,plain=valkey://b:6379", credentials)

    assert.strictEqual(targets.get("secure")?.useTLS, true)
    assert.strictEqual(targets.get("plain")?.useTLS, false)
  })

  it("strips the brackets from IPv6 hosts", () => {
    const target = parseTargets("local=[::1]:7001", credentials).get("local")

    assert.strictEqual(target?.host, "::1")
    assert.strictEqual(target?.port, 7001)
  })

  it("ignores whitespace and empty entries", () => {
    const targets = parseTargets(" a = h1:1 , , b=h2:2, ", credentials)

    assert.deepStrictEqual([...targets.keys()], ["a", "b"])
  })

  it("accepts names with letters, digits, - and _", () => {
    assert.ok(parseTargets("Prod_eu-1=h:1", credentials).has("Prod_eu-1"))
  })

  for (const entry of [
    "h:6379",
    "=h:6379",
    "a b=h:6379",
    "a.b=h:6379",
    "a/b=h:6379",
    "a=",
    "a=http://h:6379",
    "a=rediss://h:6379",
    "a=valkey://user:pw@h:6379",
    "a=h:6379/0",
    "a=h:6379?db=1",
    "a=h:6379#x",
    "a=h:70000",
  ]) {
    it(`rejects ${JSON.stringify(entry)}`, () => {
      assert.throws(() => parseTargets(entry, credentials), /Invalid VALKEY_ADMIN_MCP_TARGETS entry 1/)
    })
  }

  it("names the position of the invalid entry", () => {
    assert.throws(() => parseTargets("a=h:1,b=h:2,c=http://h:3", credentials), /entry 3\./)
  })

  it("does not echo the entry, so credentials in it do not reach the log", () => {
    assert.throws(
      () => parseTargets("a=valkey://admin:hunter2@h:6379", credentials),
      (error: Error) => !error.message.includes("hunter2") && !error.message.includes("admin"),
    )
  })

  it("rejects duplicate names", () => {
    assert.throws(() => parseTargets("a=h:1,a=h:2", credentials), /names "a" twice/)
  })

  it("rejects a list with no targets", () => {
    for (const value of ["", " ", " , ,"]) {
      assert.throws(() => parseTargets(value, credentials), /lists no targets/)
    }
  })
})

describe("targetFromPath", () => {
  it("returns the target name of /mcp/<name>", () => {
    assert.strictEqual(targetFromPath("/mcp/prod"), "prod")
  })

  for (const path of ["/mcp", "/mcp/", "/mcp/prod/extra", "/mcp/a.b", "/other/prod", "/mcp/../prod"]) {
    it(`returns nothing for ${path}`, () => {
      assert.strictEqual(targetFromPath(path), undefined)
    })
  }
})
