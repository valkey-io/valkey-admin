import { z } from "zod"
import { EPIC_FIELD_BOUNDS } from "../../../common/src/constants.js"

/**
 * Request schema for POST /update-config.
 *
 * The endpoint tunes collection settings on epics that already exist in
 * `config.yml`; it is not a general config writer. Everything is default-deny:
 *
 *  - the only accepted top-level key is `epics`
 *  - `epics` is a map keyed by epic name, so no entry can be created, removed
 *    or renamed — the key is used purely to look up an existing epic
 *  - epic identity (`name`) and `server.data_dir` stay YAML/env-only, which is
 *    what keeps API input out of every filesystem path (see ndjson-writer.js)
 *  - unknown fields are rejected rather than ignored, so a typo fails loudly
 *    instead of silently doing nothing
 *
 * Field bounds live in `common/src/constants.ts` so the UI inputs that produce
 * these values and this validator cannot drift apart.
 */

// Epic names double as NDJSON filename prefixes, so keep them to a safe token.
const EPIC_NAME_PATTERN = /^[a-z0-9_]+$/

// Map keys that would touch an object's prototype instead of creating a
// property. Rejected before parsing so they can never reach object assembly.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"])

const boundedInt = ({ min, max }) => z.number().int().min(min).max(max).optional()

const epicPatchSchema = z
  .strictObject(
    Object.fromEntries(
      Object.entries(EPIC_FIELD_BOUNDS).map(([field, bounds]) => [field, boundedInt(bounds)]),
    ),
  )
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "must contain at least one field to update",
  })

export const configUpdateSchema = z.strictObject({
  epics: z
    .record(
      z.string().regex(EPIC_NAME_PATTERN, "epic names may only contain lowercase letters, digits and underscores"),
      epicPatchSchema,
    )
    .refine((epics) => Object.keys(epics).length > 0, {
      message: "epics must name at least one epic to update",
    }),
})

/**
 * Prototype-key guard, run before parsing. Only the two levels the schema can
 * key an object by are checked (the payload root and the `epics` map), so
 * there is no recursion over untrusted depth.
 */
export const findForbiddenKey = (payload) => {
  const levels = [payload, payload?.epics]
  for (const level of levels) {
    if (level == null || typeof level !== "object") continue
    const forbidden = Object.keys(level).find((key) => FORBIDDEN_KEYS.has(key))
    if (forbidden) return forbidden
  }
  return null
}

/** Flatten zod issues into one message, naming the offending path. */
export const formatIssues = (error) =>
  error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ")
