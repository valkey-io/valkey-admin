// Bearer token check for MCP requests. Hashes both tokens so timingSafeEqual
// can compare them at equal length, and answers 401 on a mismatch.
import { createHash, timingSafeEqual } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"

const BEARER_PREFIX = "Bearer "

const digest = (value: string) => createHash("sha256").update(value).digest()

export const bearerTokenValidation = (token: string) => {
  const expected = digest(token)
  return (req: IncomingMessage, res: ServerResponse) => {
    const header = req.headers.authorization ?? ""
    const provided = header.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : ""
    if (timingSafeEqual(digest(provided), expected)) return true
    res.writeHead(401, { "www-authenticate": "Bearer" }).end()
    return false
  }
}
