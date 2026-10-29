import { afterEach, describe, it, mock } from "node:test"
import assert from "node:assert"
import { GoogleAuth } from "google-auth-library"
import { registerGcpTokenRefresh, unregisterGcpTokenRefresh, __test__ } from "../iam-token-refresh"

describe("registerGcpTokenRefresh", () => {
  afterEach(() => mock.restoreAll())

  it("keeps minting on refresh when a CA path was registered", async () => {
    mock.method(GoogleAuth.prototype, "getAccessToken", async () => "fresh-token")
    const pushed: string[] = []
    const client = { updateConnectionPassword: async (p: string) => { pushed.push(p) } }

    registerGcpTokenRefresh(client, "test", true, true, "/etc/ca.pem")
    try {
      await __test__.refresh(client)
      assert.deepStrictEqual(pushed, ["fresh-token"])
    } finally {
      unregisterGcpTokenRefresh(client)
    }
  })

  it("does not push a token on refresh when no CA path was registered", async () => {
    const mint = mock.method(GoogleAuth.prototype, "getAccessToken", async () => "fresh-token")
    const pushed: string[] = []
    const client = { updateConnectionPassword: async (p: string) => { pushed.push(p) } }

    registerGcpTokenRefresh(client, "test", true, true, undefined)
    try {
      await __test__.refresh(client)
      assert.deepStrictEqual(pushed, [])
      assert.strictEqual(mint.mock.calls.length, 0)
    } finally {
      unregisterGcpTokenRefresh(client)
    }
  })
})
