import { describe, it } from "node:test"
import assert from "node:assert"
import { bearerTokenValidation } from "../auth"
import type { IncomingMessage, ServerResponse } from "node:http"

const TOKEN = "a".repeat(64)

const makeRequest = (authorization?: string) =>
  ({ headers: authorization === undefined ? {} : { authorization } }) as IncomingMessage

const makeResponse = () => {
  const res = {
    status: undefined as number | undefined,
    headers: undefined as Record<string, string> | undefined,
    ended: false,
    writeHead(status: number, headers: Record<string, string>) {
      res.status = status
      res.headers = headers
      return res
    },
    end() {
      res.ended = true
      return res
    },
  }
  return res
}

const validate = (authorization?: string) => {
  const res = makeResponse()
  const allowed = bearerTokenValidation(TOKEN)(makeRequest(authorization), res as unknown as ServerResponse)
  return { allowed, res }
}

describe("bearerTokenValidation", () => {
  it("allows the configured token and leaves the response untouched", () => {
    const { allowed, res } = validate(`Bearer ${TOKEN}`)

    assert.strictEqual(allowed, true)
    assert.strictEqual(res.status, undefined)
    assert.strictEqual(res.ended, false)
  })

  for (const [name, authorization] of [
    ["no header", undefined],
    ["an empty header", ""],
    ["a wrong token", `Bearer ${"b".repeat(64)}`],
    ["a shorter token", `Bearer ${TOKEN.slice(1)}`],
    ["a longer token", `Bearer ${TOKEN}a`],
    ["another scheme", `Basic ${TOKEN}`],
    ["the token without a scheme", TOKEN],
    ["an empty bearer token", "Bearer "],
  ] as const) {
    it(`refuses ${name} with 401 and a Bearer challenge`, () => {
      const { allowed, res } = validate(authorization)

      assert.strictEqual(allowed, false)
      assert.strictEqual(res.status, 401)
      assert.deepStrictEqual(res.headers, { "www-authenticate": "Bearer" })
      assert.strictEqual(res.ended, true)
    })
  }
})
