import crypto from "node:crypto"

/**
 * Credential protocol for the metrics-collector control plane
 * (`POST /orchestrator/register`, `POST /orchestrator/ping`).
 *
 * Shared by the orchestrator (`apps/server`) and every collector
 * (`apps/metrics`) so the two can never drift on the signed byte string.
 *
 * The scheme is an HMAC-SHA256 tag over a canonical message: a byte string
 * that is never transmitted, rebuilt independently by each side from the
 * field values that are transmitted. Because the tag covers the claim itself
 * (which node, which URI), a captured credential cannot be replayed with a
 * substituted `metricsServerUri`, it can only re-assert the value it was
 * issued for.
 *
 * The message carries a domain tag so a registration credential cannot be
 * replayed as a ping, and a timestamp so a captured credential expires.
 *
 * Key material is an opaque UTF-8 string, deliberately: the orchestrator
 * mints one per spawned collector and passes it through the spawn
 * environment, and both sides feed the same string to `createHmac` with no
 * intermediate decoding step that could disagree.
 */

/** Request header carrying the credential. Lowercase for direct `req.headers` lookup. */
export const ORCHESTRATOR_AUTH_HEADER = "x-orchestrator-auth"

/** Environment variable holding the collector's key, on both sides. */
export const ORCHESTRATOR_AUTH_KEY_ENV = "ORCHESTRATOR_KEY"

/** Environment variable overriding the freshness window. */
export const ORCHESTRATOR_AUTH_WINDOW_ENV = "ORCHESTRATOR_AUTH_WINDOW_MS"

/** Environment variable overriding the collector control-plane rate limit. */
export const ORCHESTRATOR_RATE_LIMIT_MAX_ENV = "ORCHESTRATOR_RATE_LIMIT_MAX"

/**
 * Default requests per minute allowed on `/orchestrator/*`, per source address.
 *
 * Sized for the shared-bucket case rather than per-collector traffic. Spawned
 * collectors all call back to `SERVER_HOST` from the same host, so an entire
 * cluster's collectors land in one loopback bucket: at a 10s ping interval
 * that is 6 requests per minute per node, so this default covers roughly a
 * 100-node cluster with headroom for registration retries.
 */
export const ORCHESTRATOR_RATE_LIMIT_DEFAULT_MAX = 600

/** Protocol version, prefixing both the canonical message and the credential. */
export const ORCHESTRATOR_AUTH_VERSION = "v1"

/** Default freshness window: how far a timestamp may sit from server time. */
export const ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS = 60_000

/**
 * Domain separator. Included in the signed message so a credential minted
 * for one route cannot be presented to the other.
 */
export const ORCHESTRATOR_AUTH_DOMAIN = {
  REGISTER: "register",
  PING: "ping",
} as const

export type OrchestratorAuthDomain =
  (typeof ORCHESTRATOR_AUTH_DOMAIN)[keyof typeof ORCHESTRATOR_AUTH_DOMAIN]

/**
 * Values covered by the tag. `metricsServerUri` is required for the
 * `register` domain and ignored for `ping`.
 */
export type OrchestratorAuthFields = {
  nodeId: string
  timestamp: number
  metricsServerUri?: string
}

export type OrchestratorAuthFailureReason =
  | "missing_key"
  | "missing_credential"
  | "malformed_credential"
  | "unsupported_version"
  | "invalid_fields"
  | "stale_timestamp"
  | "invalid_signature"

export type OrchestratorAuthResult =
  | { ok: true }
  | { ok: false; reason: OrchestratorAuthFailureReason; skewMs?: number }

/**
 * Field separator for the canonical message.
 *
 * Newline is chosen because `nodeId` is already constrained to
 * `[a-zA-Z0-9_-]` by `sanitizeUrl`, and any field containing the separator is
 * rejected outright (see `buildOrchestratorAuthMessage`). Without that
 * rejection the field boundaries would be ambiguous and two distinct claims
 * could serialize to the same message, letting one valid tag authorize both.
 */
const FIELD_SEPARATOR = "\n"

const CREDENTIAL_SEPARATOR = ";"

/** A field is signable only if it is a non-empty string free of the separator. */
const isSignableField = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && !value.includes(FIELD_SEPARATOR)

/**
 * Timestamps must be non-negative integers so that `String(timestamp)`
 * is unambiguous across both sides.
 */
const isSignableTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0

/**
 * Build the canonical message for a domain, or `null` when the fields cannot
 * be represented unambiguously.
 *
 * Returning `null` rather than throwing matters on the verification side:
 * the inputs are attacker-controlled, so malformed fields must produce a
 * rejection rather than an exception.
 *
 *   register:  v1\nregister\n{nodeId}\n{metricsServerUri}\n{timestamp}
 *   ping:      v1\nping\n{nodeId}\n{timestamp}
 */
export const buildOrchestratorAuthMessage = (
  domain: OrchestratorAuthDomain,
  fields: OrchestratorAuthFields,
): string | null => {
  const { nodeId, metricsServerUri, timestamp } = fields

  if (!isSignableField(nodeId)) return null
  if (!isSignableTimestamp(timestamp)) return null

  if (domain === ORCHESTRATOR_AUTH_DOMAIN.REGISTER) {
    if (!isSignableField(metricsServerUri)) return null
    return [
      ORCHESTRATOR_AUTH_VERSION,
      domain,
      nodeId,
      metricsServerUri,
      String(timestamp),
    ].join(FIELD_SEPARATOR)
  }

  if (domain === ORCHESTRATOR_AUTH_DOMAIN.PING) {
    return [
      ORCHESTRATOR_AUTH_VERSION,
      domain,
      nodeId,
      String(timestamp),
    ].join(FIELD_SEPARATOR)
  }

  return null
}

/** Tag a canonical message, producing the `v1;<base64url>` credential. */
export const signOrchestratorAuthMessage = (key: string, message: string): string =>
  `${ORCHESTRATOR_AUTH_VERSION}${CREDENTIAL_SEPARATOR}${
    crypto.createHmac("sha256", key).update(message, "utf8").digest("base64url")
  }`

/**
 * Collector-side entry point: build and sign in one step. Returns `null` when
 * the fields are not signable, so a caller cannot accidentally send an
 * unsigned request.
 */
export const createOrchestratorAuthCredential = (
  key: string,
  domain: OrchestratorAuthDomain,
  fields: OrchestratorAuthFields,
): string | null => {
  if (!isSignableField(key)) return null
  const message = buildOrchestratorAuthMessage(domain, fields)
  return message === null ? null : signOrchestratorAuthMessage(key, message)
}

/**
 * Constant-time comparison of two UTF-8 strings.
 *
 * `crypto.timingSafeEqual` throws on unequal lengths, so the length check has
 * to come first. Leaking the length is harmless here: both operands are
 * fixed-width HMAC-SHA256 tags in practice, so a mismatch only reveals that
 * the credential was malformed, which the caller already distinguishes.
 */
const timingSafeEqualUtf8 = (a: string, b: string): boolean => {
  const bufferA = Buffer.from(a, "utf8")
  const bufferB = Buffer.from(b, "utf8")
  if (bufferA.length !== bufferB.length) return false
  return crypto.timingSafeEqual(bufferA, bufferB)
}

/**
 * Verify a presented credential against the request's own field values.
 *
 * Rebuilding the message from `fields` is what binds the credential to the
 * claim. Alter any signed field in transit and the recomputed tag stops
 * matching.
 *
 * @param key - Resolved key material for this `nodeId`.
 * @param credential - Raw `x-orchestrator-auth` header value.
 * @param domain - Route being authenticated.
 * @param fields - Values taken from the request itself.
 * @param nowMs - Injectable clock for tests. Defaults to `Date.now()`.
 * @param windowMs - Freshness window. Defaults to
 *   `ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS`.
 */
export const verifyOrchestratorAuthCredential = ({
  key,
  credential,
  domain,
  fields,
  nowMs,
  windowMs,
}: {
  key: string | undefined
  credential: string | undefined | null
  domain: OrchestratorAuthDomain
  fields: OrchestratorAuthFields
  nowMs?: number
  windowMs?: number
}): OrchestratorAuthResult => {
  if (!isSignableField(key)) return { ok: false, reason: "missing_key" }
  if (typeof credential !== "string" || credential.length === 0) {
    return { ok: false, reason: "missing_credential" }
  }

  const separatorIndex = credential.indexOf(CREDENTIAL_SEPARATOR)
  if (separatorIndex <= 0) return { ok: false, reason: "malformed_credential" }

  const version = credential.slice(0, separatorIndex)
  const tag = credential.slice(separatorIndex + 1)
  if (version !== ORCHESTRATOR_AUTH_VERSION) return { ok: false, reason: "unsupported_version" }
  if (tag.length === 0) return { ok: false, reason: "malformed_credential" }

  const message = buildOrchestratorAuthMessage(domain, fields)
  if (message === null) return { ok: false, reason: "invalid_fields" }

  // Freshness is checked before the tag so an expired-but-valid credential is
  // reported as skew rather than as a bad key.
  const effectiveNowMs = nowMs ?? Date.now()
  const effectiveWindowMs = windowMs ?? ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS
  const skewMs = effectiveNowMs - fields.timestamp
  if (Math.abs(skewMs) > effectiveWindowMs) {
    return { ok: false, reason: "stale_timestamp", skewMs }
  }

  if (!timingSafeEqualUtf8(signOrchestratorAuthMessage(key, message), credential)) {
    return { ok: false, reason: "invalid_signature" }
  }

  return { ok: true }
}

/** Mint key material for one collector. 32 random bytes, hex encoded. */
export const generateOrchestratorAuthKey = (): string =>
  crypto.randomBytes(32).toString("hex")

/**
 * Resolve the freshness window from a raw environment value, falling back to
 * the default for absent, non-numeric, or non-positive input.
 */
export const resolveOrchestratorAuthWindowMs = (raw: string | undefined): number => {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ORCHESTRATOR_AUTH_DEFAULT_WINDOW_MS
}

/**
 * Resolve the collector control-plane rate limit from a raw environment
 * value, falling back to the default for absent, non-integer, or non-positive
 * input.
 */
export const resolveOrchestratorRateLimitMax = (raw: string | undefined): number => {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : ORCHESTRATOR_RATE_LIMIT_DEFAULT_MAX
}
