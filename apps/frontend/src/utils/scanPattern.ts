/**
 * Convert user search input into a SCAN MATCH pattern.
 * If the input contains no glob characters, wrap with wildcards for substring matching.
 * If it contains glob characters, use as-is (power user mode).
 * Empty input returns "*" (match all).
 */
export const toScanPattern = (input: string): string => {
  if (!input) return "*"
  const hasGlob = /[*?[\]]/.test(input)
  return hasGlob ? input : `*${input}*`
}
