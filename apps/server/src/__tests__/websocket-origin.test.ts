import { afterEach, describe, it } from "node:test"
import assert from "node:assert"
import type { IncomingMessage } from "http"
import { DEPLOYMENT_TYPE } from "valkey-common"
import { isAllowedWebSocketOrigin } from "../websocket-origin"

const makeRequest = (headers: Record<string, string | undefined>) =>
  ({ headers }) as IncomingMessage

describe("isAllowedWebSocketOrigin", () => {
  const originalDeploymentMode = process.env.DEPLOYMENT_MODE
  const originalAllowedOrigins = process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS

  afterEach(() => {
    process.env.DEPLOYMENT_MODE = originalDeploymentMode
    process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS = originalAllowedOrigins
  })

  it("rejects requests without an origin header", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON

    assert.strictEqual(isAllowedWebSocketOrigin(makeRequest({ host: "localhost:8080" })), false)
  })

  it("allows packaged Electron origins", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON

    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "file://", host: "localhost:8080" })),
      true,
    )
    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "null", host: "localhost:8080" })),
      true,
    )
  })

  it("allows loopback origins in Electron mode and blocks remote origins", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON

    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "http://localhost:5173", host: "localhost:8080" })),
      true,
    )
    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "https://evil.example", host: "localhost:8080" })),
      false,
    )
  })

  it("allows same-host web origins and rejects cross-origin requests", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB

    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "https://admin.example.com", host: "admin.example.com" })),
      true,
    )
    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "https://evil.example", host: "admin.example.com" })),
      false,
    )
  })

  it("honors explicit allowlist overrides", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS = "https://trusted.example, https://other.example/"

    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "https://trusted.example", host: "admin.example.com" })),
      true,
    )
    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "https://other.example", host: "admin.example.com" })),
      true,
    )
  })
})
