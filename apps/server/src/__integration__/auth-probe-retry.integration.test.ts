import { after, before, describe, it } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { GlideClient } from "@valkey/valkey-glide"
import { buildConnectionId, VALKEY } from "valkey-common"
import { WsClient } from "./harness/wsClient"
import { defaultStandaloneConnectionDetails, WS_URL } from "./harness/fixture"

const QUIET_WINDOW_MS = 30_000
const FAILED_CONNECTS = 5

/**
 * Failed AUTH attempts that Valkey logged for `username`. Other test files run
 * at the same time and can fail AUTH as other users, so the server-wide
 * `acl_access_denied_auth` counter is not used. Valkey groups repeated
 * failures of one user into one entry and counts them in `count`.
 */
const failedAuthCount = async (client: GlideClient, username: string): Promise<number> => {
  const entries = await client.customCommand(["ACL", "LOG"]) as Array<Array<{ key: string; value: unknown }> | Record<string, unknown>>
  return entries
    .map((entry) => Array.isArray(entry) ? Object.fromEntries(entry.map(({ key, value }) => [key, value])) : entry)
    .filter((entry) => entry.reason === "auth" && entry.username === username)
    .reduce((total, entry) => total + Number(entry.count), 0)
}

/**
 * A connect that Valkey rejects must leave no client behind that keeps
 * sending AUTH. The server proves credentials with a short-lived probe before
 * every connect. When that probe was a Glide client, Glide kept the rejected
 * connection and retried AUTH until the process exited (valkey-glide#3352).
 * This test sends rejected connects, then checks that Valkey sees no further
 * AUTH attempt for that user in a quiet window.
 */
describe("integration / failed connect sends no further AUTH", async () => {
  const ws = await WsClient.connect(WS_URL)
  let observer: GlideClient

  before(async () => {
    // The standalone node's `default` user has no password.
    observer = await GlideClient.createClient({ addresses: [{ host: "localhost", port: 6379 }], requestTimeout: 5000 })
  })

  after(async () => {
    observer?.close()
    await ws.close()
  })

  it(`stops AUTH attempts after ${FAILED_CONNECTS} rejected connects`, { timeout: QUIET_WINDOW_MS + 60_000 }, async () => {
    // A user that does not exist gets WRONGPASS. A new name for each run keeps
    // this test apart from other tests and from the failed-AUTH limit.
    const username = `no-such-user-${randomUUID()}`
    const connectionDetails = { ...defaultStandaloneConnectionDetails(), username, password: "wrong" }
    const connectionId = buildConnectionId(connectionDetails.host, connectionDetails.port, 0)

    for (let i = 0; i < FAILED_CONNECTS; i++) {
      ws.send({ type: VALKEY.CONNECTION.connectPending, payload: { connectionId, connectionDetails } })
      const msg = await ws.waitFor(VALKEY.CONNECTION.connectRejected, 30000)
      assert.match(msg.payload?.errorMessage ?? "", /WRONGPASS/)
    }
    const afterRejects = await failedAuthCount(observer, username)
    assert.equal(afterRejects, FAILED_CONNECTS, "Valkey saw one AUTH attempt per rejected connect")

    await new Promise((resolve) => setTimeout(resolve, QUIET_WINDOW_MS))
    const afterQuiet = await failedAuthCount(observer, username)
    assert.equal(afterQuiet - afterRejects, 0, `no AUTH attempts for the user in the ${QUIET_WINDOW_MS / 1000} s after the rejections`)
  })
})
