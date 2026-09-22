import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { APP_VERSION } from "valkey-common"

const glideMocks = vi.hoisted(() => ({
  standaloneCreateClient: vi.fn(),
  clusterCreateClient: vi.fn(),
}))

vi.mock("@valkey/valkey-glide", () => ({
  GlideClient: {
    createClient: glideMocks.standaloneCreateClient,
  },
  GlideClusterClient: {
    createClient: glideMocks.clusterCreateClient,
  },
  NodeDiscoveryMode: { Standard: 0, Static: 1, DiscoverAll: 2 },
}))

describe("valkey client mode selection", () => {
  let originalEnv

  beforeEach(() => {
    vi.resetModules()
    glideMocks.standaloneCreateClient.mockReset().mockResolvedValue({ kind: "standalone" })
    glideMocks.clusterCreateClient.mockReset().mockResolvedValue({ kind: "cluster" })
    originalEnv = { ...process.env }
    process.env.VALKEY_HOST = "localhost"
    process.env.VALKEY_PORT = "6379"
    delete process.env.VALKEY_MODE
    delete process.env.VALKEY_TLS
    delete process.env.VALKEY_VERIFY_CERT
    delete process.env.VALKEY_USERNAME
    delete process.env.VALKEY_PASSWORD
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it("defaults to standalone mode", async () => {
    const { createValkeyClient } = await import("./valkey-client.js")

    const client = await createValkeyClient({})

    expect(client).toEqual({ kind: "standalone" })
    expect(glideMocks.standaloneCreateClient).toHaveBeenCalledOnce()
    expect(glideMocks.clusterCreateClient).not.toHaveBeenCalled()
  })

  it("uses a node-local client even when config asks for cluster mode", async () => {
    const { createValkeyClient } = await import("./valkey-client.js")

    const client = await createValkeyClient({ valkey: { mode: "cluster" } })

    expect(client).toEqual({ kind: "standalone" })
    expect(glideMocks.standaloneCreateClient).toHaveBeenCalledOnce()
    expect(glideMocks.clusterCreateClient).not.toHaveBeenCalled()
  })

  it("uses a node-local client even when VALKEY_MODE asks for cluster mode", async () => {
    process.env.VALKEY_MODE = "cluster"
    const { createValkeyClient } = await import("./valkey-client.js")

    await createValkeyClient({ valkey: { mode: "standalone" } })

    expect(glideMocks.standaloneCreateClient).toHaveBeenCalledOnce()
    expect(glideMocks.clusterCreateClient).not.toHaveBeenCalled()
  })

  it("warns once when a non-standalone mode is configured", async () => {
    process.env.VALKEY_MODE = "cluster"
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { createValkeyClient } = await import("./valkey-client.js")

    await createValkeyClient({})

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain("Ignoring VALKEY_MODE")
    warn.mockRestore()
  })

  it("does not warn when no mode is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { createValkeyClient } = await import("./valkey-client.js")

    await createValkeyClient({})

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it("passes tls and credentials through", async () => {
    process.env.VALKEY_TLS = "true"
    process.env.VALKEY_VERIFY_CERT = "false"
    process.env.VALKEY_USERNAME = "default"
    process.env.VALKEY_PASSWORD = "secret"
    const { createValkeyClient } = await import("./valkey-client.js")

    await createValkeyClient({})

    expect(glideMocks.standaloneCreateClient).toHaveBeenCalledWith({
      addresses: [{ host: "localhost", port: 6379 }],
      credentials: { username: "default", password: "secret" },
      useTLS: true,
      clientInfoTag: `valkey-admin-metrics-web:${APP_VERSION}`,
      advancedConfiguration: {
        tlsAdvancedConfiguration: {
          insecure: true,
        },
        connectionTimeout: 30000,
      },
      requestTimeout: 5000,
      clientName: "valkey_admin_metrics_standalone_client",
      nodeDiscoveryMode: 1,
    })
  })
})
