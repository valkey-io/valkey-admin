import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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

  it("uses cluster mode from config", async () => {
    const { createValkeyClient } = await import("./valkey-client.js")

    const client = await createValkeyClient({ valkey: { mode: "cluster" } })

    expect(client).toEqual({ kind: "cluster" })
    expect(glideMocks.clusterCreateClient).toHaveBeenCalledOnce()
    expect(glideMocks.standaloneCreateClient).not.toHaveBeenCalled()
  })

  it("lets VALKEY_MODE override config", async () => {
    process.env.VALKEY_MODE = "cluster"
    const { createValkeyClient } = await import("./valkey-client.js")

    await createValkeyClient({ valkey: { mode: "standalone" } })

    expect(glideMocks.clusterCreateClient).toHaveBeenCalledOnce()
    expect(glideMocks.standaloneCreateClient).not.toHaveBeenCalled()
  })

  it("passes tls and credentials to cluster mode", async () => {
    process.env.VALKEY_MODE = "cluster"
    process.env.VALKEY_TLS = "true"
    process.env.VALKEY_VERIFY_CERT = "false"
    process.env.VALKEY_USERNAME = "default"
    process.env.VALKEY_PASSWORD = "secret"
    const { createValkeyClient } = await import("./valkey-client.js")

    await createValkeyClient({})

    expect(glideMocks.clusterCreateClient).toHaveBeenCalledWith({
      addresses: [{ host: "localhost", port: 6379 }],
      credentials: { username: "default", password: "secret" },
      useTLS: true,
      advancedConfiguration: {
        tlsAdvancedConfiguration: {
          insecure: true,
        },
      },
      requestTimeout: 30000,
      clientName: "valkey_admin_metrics_cluster_client",
    })
  })

  it("rejects unsupported mode values", async () => {
    process.env.VALKEY_MODE = "sentinel"
    const { createValkeyClient } = await import("./valkey-client.js")

    await expect(createValkeyClient({})).rejects.toThrow("Unsupported VALKEY_MODE: sentinel")
  })
})
