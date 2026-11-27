import { describe, it, before, after } from "node:test"
import assert from "node:assert"
import { signElastiCacheIamToken } from "../elasticache-iam-token"

const ENV = {
  AWS_ACCESS_KEY_ID: "AKIDEXAMPLE",
  AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
}

describe("signElastiCacheIamToken", () => {
  const saved: Record<string, string | undefined> = {}

  before(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key]
      process.env[key] = value
    }
  })

  after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it("presigns a connect request for the user, group and region", async () => {
    const token = await signElastiCacheIamToken("alice", "my-group", "eu-west-1")
    assert.doesNotMatch(token, /^https?:\/\//, "the token has no scheme")
    const url = new URL(`https://${token}`)
    assert.strictEqual(url.hostname, "my-group")
    assert.strictEqual(url.searchParams.get("Action"), "connect")
    assert.strictEqual(url.searchParams.get("User"), "alice")
    assert.strictEqual(url.searchParams.get("X-Amz-Algorithm"), "AWS4-HMAC-SHA256")
    assert.strictEqual(url.searchParams.get("X-Amz-Expires"), "900")
    assert.match(url.searchParams.get("X-Amz-Credential") ?? "", /^AKIDEXAMPLE\/\d{8}\/eu-west-1\/elasticache\/aws4_request$/)
    assert.match(url.searchParams.get("X-Amz-Signature") ?? "", /^[0-9a-f]{64}$/)
  })
})
