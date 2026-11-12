import { describe, it } from "node:test"
import assert from "node:assert"
import {
  connectionForRequest,
  connectionFromHeaders,
  hasValkeyHeaders,
  isServedPath,
  loadConfig
} from "../config"

const TOKEN = "t".repeat(32)

describe("loadConfig", () => {
  it("applies the defaults", () => {
    const config = loadConfig({})

    assert.deepStrictEqual(config.connection, {
      host: "localhost",
      port: 6379,
      username: undefined,
      password: undefined,
      useTLS: false,
    })
    assert.deepStrictEqual(config.admin, {
      url: "ws://localhost:8080",
      origin: "valkey-admin-mcp://localhost",
      token: undefined,
    })
    assert.strictEqual(config.mcpPort, 8081)
    assert.strictEqual(config.token, undefined)
    assert.strictEqual(config.targets, undefined)
  })

  it("accepts a token of 32 characters", () => {
    assert.strictEqual(loadConfig({ VALKEY_ADMIN_MCP_TOKEN: TOKEN }).token, TOKEN)
  })

  it("rejects a token shorter than 32 characters", () => {
    assert.throws(() => loadConfig({ VALKEY_ADMIN_MCP_TOKEN: TOKEN.slice(1) }), /VALKEY_ADMIN_MCP_TOKEN/)
  })

  it("names the field but not the value of an invalid variable", () => {
    assert.throws(
      () => loadConfig({ VALKEY_ADMIN_MCP_TOKEN: "short-secret" }),
      (error: Error) => !error.message.includes("short-secret"),
    )
  })

  it("rejects a non-WebSocket admin URL", () => {
    assert.throws(() => loadConfig({ VALKEY_ADMIN_URL: "http://localhost:8080" }), /VALKEY_ADMIN_URL/)
  })

  it("rejects an invalid port", () => {
    assert.throws(() => loadConfig({ VALKEY_ADMIN_MCP_PORT: "70000" }), /VALKEY_ADMIN_MCP_PORT/)
  })

  it("gives every target the MCP credentials", () => {
    const config = loadConfig({
      VALKEY_ADMIN_MCP_TARGETS: "prod=h1:6379,cache=valkeys://h2:6380",
      VALKEY_ADMIN_MCP_USERNAME: "mcp_readonly",
      VALKEY_ADMIN_MCP_PASSWORD: "secret",
    })

    for (const name of ["prod", "cache"]) {
      assert.strictEqual(config.targets?.get(name)?.username, "mcp_readonly")
      assert.strictEqual(config.targets?.get(name)?.password, "secret")
    }
  })

  it("does not give targets the header-mode VALKEY_* credentials", () => {
    const config = loadConfig({
      VALKEY_ADMIN_MCP_TARGETS: "prod=h1:6379",
      VALKEY_USERNAME: "default",
      VALKEY_PASSWORD: "admin-password",
    })

    assert.strictEqual(config.targets?.get("prod")?.username, undefined)
    assert.strictEqual(config.targets?.get("prod")?.password, undefined)
  })

  it("rejects invalid targets", () => {
    assert.throws(() => loadConfig({ VALKEY_ADMIN_MCP_TARGETS: "prod=http://h:1" }), /VALKEY_ADMIN_MCP_TARGETS/)
  })
})

describe("hasValkeyHeaders", () => {
  it("finds X-Valkey-* headers in any case", () => {
    assert.strictEqual(hasValkeyHeaders(["authorization", "X-Valkey-Host"]), true)
    assert.strictEqual(hasValkeyHeaders(["x-valkey-password"]), true)
  })

  it("ignores other headers", () => {
    assert.strictEqual(hasValkeyHeaders(["authorization", "content-type", "x-valkeyhost"]), false)
  })
})

describe("isServedPath", () => {
  const withTargets = loadConfig({ VALKEY_ADMIN_MCP_TARGETS: "prod=h:1" })
  const withoutTargets = loadConfig({})

  it("serves only listed targets when targets are set", () => {
    assert.strictEqual(isServedPath(withTargets, "/mcp/prod"), true)
    assert.strictEqual(isServedPath(withTargets, "/mcp/other"), false)
    assert.strictEqual(isServedPath(withTargets, "/mcp"), false)
  })

  it("serves only /mcp without targets", () => {
    assert.strictEqual(isServedPath(withoutTargets, "/mcp"), true)
    assert.strictEqual(isServedPath(withoutTargets, "/mcp/prod"), false)
  })
})

describe("connectionForRequest", () => {
  it("returns the target named by the path", () => {
    const config = loadConfig({ VALKEY_ADMIN_MCP_TARGETS: "prod=h:7001" })

    assert.strictEqual(connectionForRequest(config, "/mcp/prod", undefined).port, 7001)
  })

  it("throws for an unknown target", () => {
    const config = loadConfig({ VALKEY_ADMIN_MCP_TARGETS: "prod=h:7001" })

    assert.throws(() => connectionForRequest(config, "/mcp/other", undefined), /No MCP target/)
  })

  it("uses the headers without targets", () => {
    const config = loadConfig({})
    const headers = new Headers({ "x-valkey-port": "7001" })

    assert.strictEqual(connectionForRequest(config, "/mcp", headers).port, 7001)
  })
})

describe("connectionFromHeaders", () => {
  const fallback = { host: "env-host", port: 6380, username: "env-user", password: "env-pw", useTLS: true }

  it("returns the fallback when no X-Valkey-* header is sent", () => {
    assert.strictEqual(connectionFromHeaders(new Headers({ authorization: "x" }), fallback), fallback)
    assert.strictEqual(connectionFromHeaders(undefined, fallback), fallback)
  })

  it("replaces the fallback completely when any header is sent", () => {
    assert.deepStrictEqual(connectionFromHeaders(new Headers({ "x-valkey-port": "7001" }), fallback), {
      host: "localhost",
      port: 7001,
      username: undefined,
      password: undefined,
      useTLS: false,
    })
  })

  it("reads every header", () => {
    const headers = new Headers({
      "x-valkey-host": "h",
      "x-valkey-port": "6390",
      "x-valkey-username": "u",
      "x-valkey-password": "p",
      "x-valkey-tls": "true",
    })

    assert.deepStrictEqual(connectionFromHeaders(headers, fallback), {
      host: "h",
      port: 6390,
      username: "u",
      password: "p",
      useTLS: true,
    })
  })

  it("rejects invalid headers without echoing them", () => {
    assert.throws(
      () => connectionFromHeaders(new Headers({ "x-valkey-port": "abc", "x-valkey-password": "pw123" }), fallback),
      (error: Error) => /x-valkey-port/.test(error.message) && !error.message.includes("pw123"),
    )
    assert.throws(() => connectionFromHeaders(new Headers({ "x-valkey-tls": "yes" }), fallback), /x-valkey-tls/)
  })
})
