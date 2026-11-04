import { describe, it } from "node:test"
import assert from "node:assert/strict"
import WebSocket from "ws"
import { WS_URL } from "./harness/fixture"

/**
 * DNS rebinding: an attacker's page loads from a name the attacker controls,
 * then the name is pointed at the user's loopback. The browser connects to the
 * local server with `Host` and `Origin` both set to the attacker's name, so a
 * plain same-origin check passes. Web mode with no allowlist must refuse a
 * `Host` that is not a local name.
 */
type UpgradeOutcome = { accepted: true } | { accepted: false; status: number | undefined }

const tryUpgrade = (host: string, origin: string): Promise<UpgradeOutcome> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL, { origin, headers: { Host: host } })
    const timer = setTimeout(() => {
      socket.terminate()
      reject(new Error(`upgrade with Host ${host} did not settle in 10s`))
    }, 10000)
    socket.once("open", () => {
      clearTimeout(timer)
      socket.close()
      resolve({ accepted: true })
    })
    socket.once("unexpected-response", (_req, res) => {
      clearTimeout(timer)
      res.resume()
      resolve({ accepted: false, status: res.statusCode })
    })
    socket.once("error", (err) => {
      clearTimeout(timer)
      // `unexpected-response` fires first for a 403; an error here is a real failure.
      reject(err)
    })
  })

describe("integration / WebSocket Host rule", () => {
  it("refuses a rebinding request where Origin matches a non-local Host", async () => {
    const host = "rebind.attacker.example:8080"
    const outcome = await tryUpgrade(host, `http://${host}`)
    assert.deepEqual(outcome, { accepted: false, status: 403 })
  })

  it("accepts a same-origin request with a local Host", async () => {
    const { host } = new URL(WS_URL)
    const outcome = await tryUpgrade(host, `http://${host}`)
    assert.deepEqual(outcome, { accepted: true })
  })

  it("accepts an IP-literal Host", async () => {
    const { port } = new URL(WS_URL)
    const host = `127.0.0.1:${port}`
    const outcome = await tryUpgrade(host, `http://${host}`)
    assert.deepEqual(outcome, { accepted: true })
  })
})
