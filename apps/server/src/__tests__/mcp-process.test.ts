import { afterEach, beforeEach, describe, it, mock } from "node:test"
import assert from "node:assert"
import { DEPLOYMENT_TYPE } from "valkey-common"
import {
  MCP_ENABLED_ENV,
  MCP_TARGETS_ENV,
  MCP_TOKEN_ENV,
  proxyMcpRequest,
  startMcpServer
} from "../mcp-process"
import type { Request, Response } from "express"

const ENV_NAMES = [MCP_ENABLED_ENV, MCP_TOKEN_ENV, MCP_TARGETS_ENV, "DEPLOYMENT_MODE"]

const proxyStatus = () => {
  const res = {
    statusCode: 0,
    status(code: number) {
      res.statusCode = code
      return res
    },
    end: () => res,
  }
  proxyMcpRequest({ originalUrl: "/mcp" } as Request, res as unknown as Response)
  return res.statusCode
}

describe("MCP server process", () => {
  const original = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]))
  let errors: ReturnType<typeof mock.method>
  let warnings: ReturnType<typeof mock.method>

  beforeEach(() => {
    ENV_NAMES.forEach((name) => delete process.env[name])
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    errors = mock.method(console, "error", () => {})
    warnings = mock.method(console, "warn", () => {})
  })

  afterEach(() => {
    mock.restoreAll()
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it("returns 404 from /mcp when it is not enabled", () => {
    startMcpServer("0.0.0.0", 8080)

    assert.strictEqual(proxyStatus(), 404)
    assert.strictEqual(errors.mock.callCount(), 0)
  })

  for (const enabled of ["false", "1", "TRUE"]) {
    it(`treats ${MCP_ENABLED_ENV}=${enabled} as off`, () => {
      process.env[MCP_ENABLED_ENV] = enabled

      assert.strictEqual(proxyStatus(), 404)
    })
  }

  for (const bindHost of ["0.0.0.0", "::", "192.168.1.10"]) {
    it(`does not start on ${bindHost} without a token and targets`, () => {
      process.env[MCP_ENABLED_ENV] = "true"

      startMcpServer(bindHost, 8080)

      assert.strictEqual(proxyStatus(), 503)
      const message = String(errors.mock.calls[0]?.arguments[0])
      assert.match(message, new RegExp(`${MCP_TOKEN_ENV} and ${MCP_TARGETS_ENV} must be set`))
    })
  }

  it("names only the missing variable", () => {
    process.env[MCP_ENABLED_ENV] = "true"
    process.env[MCP_TOKEN_ENV] = "t".repeat(64)

    startMcpServer("0.0.0.0", 8080)

    assert.strictEqual(proxyStatus(), 503)
    const message = String(errors.mock.calls[0]?.arguments[0])
    assert.match(message, new RegExp(`so ${MCP_TARGETS_ENV} must be set`))
    assert.doesNotMatch(message, new RegExp(`${MCP_TOKEN_ENV} and`))
  })

  it("does not start in the desktop app", () => {
    process.env[MCP_ENABLED_ENV] = "true"
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON

    startMcpServer("127.0.0.1", 8080)

    assert.strictEqual(proxyStatus(), 503)
    assert.match(String(warnings.mock.calls[0]?.arguments[0]), /ignored in the desktop app/)
  })
})
