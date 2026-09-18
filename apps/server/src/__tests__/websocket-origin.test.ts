import { afterEach, describe, it } from "node:test"
import assert from "node:assert"
import { DEPLOYMENT_TYPE } from "valkey-common"
import { isAllowedWebSocketOrigin } from "../websocket-origin"
import type { IncomingMessage } from "http"

const makeRequest = ({ url, ...headers }: Record<string, string | undefined>) =>
  ({ headers, url }) as IncomingMessage

describe("isAllowedWebSocketOrigin", () => {
  const originalDeploymentMode = process.env.DEPLOYMENT_MODE
  const originalAllowedOrigins = process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS
  const originalWsToken = process.env.ELECTRON_WS_TOKEN

  afterEach(() => {
    process.env.DEPLOYMENT_MODE = originalDeploymentMode
    process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS = originalAllowedOrigins
    process.env.ELECTRON_WS_TOKEN = originalWsToken
  })

  it("rejects requests without an origin header", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON

    assert.strictEqual(isAllowedWebSocketOrigin(makeRequest({ host: "localhost:8080" })), false)
  })

  it("allows packaged Electron origins only with a valid per-launch token", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON
    process.env.ELECTRON_WS_TOKEN = "secret-token"

    for (const origin of ["file://", "null"]) {
      assert.strictEqual(
        isAllowedWebSocketOrigin(makeRequest({ origin, host: "localhost:8080", url: "/?token=secret-token" })),
        true,
        `${origin} with valid token should be allowed`,
      )
    }
  })

  it("rejects Electron non-web origins when the token is missing or wrong", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON
    process.env.ELECTRON_WS_TOKEN = "secret-token"

    for (const origin of ["file://", "null"]) {
      // No token
      assert.strictEqual(
        isAllowedWebSocketOrigin(makeRequest({ origin, host: "localhost:8080", url: "/" })),
        false,
        `${origin} without a token must be rejected`,
      )
      // Wrong token
      assert.strictEqual(
        isAllowedWebSocketOrigin(makeRequest({ origin, host: "localhost:8080", url: "/?token=nope" })),
        false,
        `${origin} with a wrong token must be rejected`,
      )
    }
  })

  it("fails closed when no server-side token is provisioned", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON
    delete process.env.ELECTRON_WS_TOKEN

    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "null", host: "localhost:8080", url: "/?token=anything" })),
      false,
    )
  })

  it("allows loopback origins in Electron mode only with a token and blocks remote origins", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON
    process.env.ELECTRON_WS_TOKEN = "secret-token"

    assert.strictEqual(
      isAllowedWebSocketOrigin(
        makeRequest({ origin: "http://localhost:5173", host: "localhost:8080", url: "/?token=secret-token" }),
      ),
      true,
    )
    // Loopback origin but no token
    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "http://localhost:5173", host: "localhost:8080", url: "/" })),
      false,
    )
    // Remote origin is rejected regardless of token
    assert.strictEqual(
      isAllowedWebSocketOrigin(
        makeRequest({ origin: "https://evil.example", host: "localhost:8080", url: "/?token=secret-token" }),
      ),
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
