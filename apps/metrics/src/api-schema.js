import * as R from "ramda"
import { z } from "zod"

const lastQueryValue = (v) => (Array.isArray(v) ? v.at(-1) : v)

const parseOptionalNum =
  ({ abs = false, int = false } = {}) =>
    (v) => {
      const raw = lastQueryValue(v)
      if (raw == null || raw === "") return undefined

      let n = Number(raw)
      if (!Number.isFinite(n)) return undefined // isFinite takes care of NaN, so no need to check for it again

      n = abs ? Math.abs(n) : n
      n = int ? Math.trunc(n) : n

      return n
    }

const bounded = (base, { min, max } = {}) => {
  let s = base
  if (typeof min === "number") s = s.gte(min)
  if (typeof max === "number") s = s.lte(max)
  return s
}

export const optionalNumber = (opts = {}) =>
  z.preprocess(
    parseOptionalNum({ ...opts, int: false }),
    bounded(z.number(), opts).optional(),
  )

export const optionalInt = (opts = {}) =>
  z.preprocess(
    parseOptionalNum({ ...opts, int: true }),
    bounded(z.number().int(), opts).optional(),
  )

// just a helper to parse an object query schema; on failure, return empty object
export const parseQuery = (schema) =>
  R.pipe(
    schema.safeParse,
    R.ifElse(
      R.prop("success"),
      R.prop("data"),
      R.always({}),
    ),
  )

export const memoryQuerySchema = z.object({
  maxPoints: optionalInt({ min: 4, max: 600, abs: true }),
  since: optionalInt(),
  until: optionalInt(),
})

export const cpuQuerySchema = z.object({
  maxPoints: optionalInt({ min: 4, max: 600, abs: true }),
  tolerance: optionalNumber({ min: 0, max: 0.3, abs: true }),
  since: optionalInt(),
  until: optionalInt(),
})

// absent or invalid values fall back to the defaults defined in scanBigKeys
export const bigKeysQuerySchema = z.object({
  scanLimit: optionalInt({ min: 1, abs: true }),
  topN: optionalInt({ min: 1, abs: true }),
  batchSize: optionalInt({ min: 1, abs: true }),
})
