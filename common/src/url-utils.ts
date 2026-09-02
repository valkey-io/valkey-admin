export const sanitizeUrl = (input: string) => input.replace(/[^a-zA-Z0-9_-]/g, "-")

/**
 * Build an absolute URL by resolving `path` against `base`.
 *
 * Always prefer this over template concatenation. `${base}/path?a=b` lets a
 * base that carries its own path or query reshape the resulting request — a
 * base ending in `?x=` would swallow the path into a query string, sending
 * the request somewhere other than `path`. Resolving against a parsed `URL`
 * pins the path and keeps parameters in the query.
 *
 * Note this pins the *path*; it does not sanitize `base` itself. A caller
 * that interpolates untrusted input into `base` still needs to validate it.
 *
 * @param base - Absolute base URL, e.g. a collector's advertised `metricsURI`.
 * @param path - Absolute API path, e.g. `/cpu`.
 * @param params - Query parameters, appended after resolution.
 */
export const buildUrl = (
  base: string,
  path: string,
  params: Record<string, string | number> = {},
): string => {
  const url = new URL(path, base)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}
