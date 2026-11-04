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
  const originalAllowAnyHost = process.env.VALKEY_ADMIN_ALLOW_ANY_HOST

  const restoreEnv = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }

  afterEach(() => {
    restoreEnv("DEPLOYMENT_MODE", originalDeploymentMode)
    restoreEnv("VALKEY_ADMIN_ALLOWED_WS_ORIGINS", originalAllowedOrigins)
    restoreEnv("ELECTRON_WS_TOKEN", originalWsToken)
    restoreEnv("VALKEY_ADMIN_ALLOW_ANY_HOST", originalAllowAnyHost)
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

  it("rejects cross-origin requests in web mode", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    delete process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS

    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "https://evil.example", host: "localhost:8080" })),
      false,
    )
  })

  // DNS rebinding: the attacker's page sets both Origin and Host to a name the
  // attacker controls, and the browser connects to loopback. Only a local Host
  // is accepted when no allowlist is set.
  it("rejects a same-origin request whose Host is a DNS name when no allowlist is configured", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    delete process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS
    delete process.env.VALKEY_ADMIN_ALLOW_ANY_HOST

    for (const host of ["rebind.attacker.example:8080", "admin.example.com", "localhost.evil.example:8080"]) {
      assert.strictEqual(
        isAllowedWebSocketOrigin(makeRequest({ origin: `http://${host}`, host })),
        false,
        `${host} must be refused`,
      )
    }
  })

  it("accepts local Host values when no allowlist is configured", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    delete process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS
    delete process.env.VALKEY_ADMIN_ALLOW_ANY_HOST

    const hosts = [
      "localhost:8080", "LOCALHOST:8080", "127.0.0.1:8080", "[::1]:8080", "app.localhost:8080", "192.168.1.20:8080", "10.0.0.5",
    ]
    for (const host of hosts) {
      assert.strictEqual(
        isAllowedWebSocketOrigin(makeRequest({ origin: `http://${host}`, host })),
        true,
        `${host} must be accepted`,
      )
    }
  })

  it("accepts any Host when VALKEY_ADMIN_ALLOW_ANY_HOST is exactly \"true\"", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    delete process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS
    const request = makeRequest({ origin: "https://admin.example.com", host: "admin.example.com" })

    process.env.VALKEY_ADMIN_ALLOW_ANY_HOST = "true"
    assert.strictEqual(isAllowedWebSocketOrigin(request), true)

    for (const value of ["1", "yes", "TRUE", ""]) {
      process.env.VALKEY_ADMIN_ALLOW_ANY_HOST = value
      assert.strictEqual(isAllowedWebSocketOrigin(request), false, `value ${JSON.stringify(value)} must not disable the check`)
    }
  })

  it("still requires Origin to match Host when the flag is set", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    delete process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS
    process.env.VALKEY_ADMIN_ALLOW_ANY_HOST = "true"

    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "https://evil.example", host: "admin.example.com" })),
      false,
    )
  })

  it("does not apply the Host rule when an allowlist is configured", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS = "https://admin.example.com"
    delete process.env.VALKEY_ADMIN_ALLOW_ANY_HOST

    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "https://admin.example.com", host: "admin.example.com" })),
      true,
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

  it("rejects same-host origins in web mode when an allowlist is configured", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS = "https://admin.example.com"

    // Not on the allowlist, even though Origin matches Host.
    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "http://evil.example:8080", host: "evil.example:8080" })),
      false,
    )
    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "https://admin.example.com", host: "admin.example.com" })),
      true,
    )
  })

  it("keeps same-origin matching in web mode when no allowlist is configured", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.WEB
    delete process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS

    assert.strictEqual(
      isAllowedWebSocketOrigin(makeRequest({ origin: "http://localhost:8080", host: "localhost:8080" })),
      true,
    )
  })

  it("keeps Electron loopback origins working when an allowlist is configured", () => {
    process.env.DEPLOYMENT_MODE = DEPLOYMENT_TYPE.ELECTRON
    process.env.ELECTRON_WS_TOKEN = "secret-token"
    process.env.VALKEY_ADMIN_ALLOWED_WS_ORIGINS = "https://trusted.example"

    assert.strictEqual(
      isAllowedWebSocketOrigin(
        makeRequest({ origin: "http://localhost:5173", host: "localhost:8080", url: "/?token=secret-token" }),
      ),
      true,
    )
  })
})
