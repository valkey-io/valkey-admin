interface KeyInfo {
  name: string
  type?: string
  ttl?: number
  size?: number
  collectionSize?: number
}

export type SortField = "name" | "ttl" | "size"
export type SortDirection = "asc" | "desc"

export interface SortOption {
  field: SortField
  direction: SortDirection
}

/**
 * Sorts an array of keys based on the specified sort option
 * @param keys Array of key information objects
 * @param sortOption Sort configuration specifying field and direction
 * @returns New sorted array of keys
 */
export function sortKeys(keys: KeyInfo[], sortOption: SortOption): KeyInfo[] {
  if (!keys || keys.length === 0) {
    return keys
  }

  const sortedKeys = [...keys]

  sortedKeys.sort((a, b) => {
    let comparison = 0

    switch (sortOption.field) {
      case "name":
        comparison = compareNames(a.name, b.name)
        break
      case "ttl":
        comparison = compareTTL(a.ttl, b.ttl)
        break
      case "size":
        comparison = compareSize(a.size, b.size)
        break
      default:
        comparison = 0
    }

    return sortOption.direction === "desc" ? -comparison : comparison
  })

  return sortedKeys
}

/**
 * Compares two key names case-insensitively
 */
function compareNames(nameA: string, nameB: string): number {
  const normalizedA = nameA.toLowerCase()
  const normalizedB = nameB.toLowerCase()

  if (normalizedA < normalizedB) return -1
  if (normalizedA > normalizedB) return 1
  return 0
}

/**
 * Compares TTL values with special handling for -1 (no expiration)
 * TTL -1 is treated as the highest value for sorting purposes
 */
function compareTTL(ttlA: number | undefined, ttlB: number | undefined): number {
  const valueA = ttlA ?? -1
  const valueB = ttlB ?? -1

  // Handle -1 as highest value
  if (valueA === -1 && valueB === -1) return 0
  if (valueA === -1) return 1  // -1 is greater than any other value
  if (valueB === -1) return -1 // any value is less than -1

  return valueA - valueB
}

/**
 * Compares size values with special handling for zero/unknown values
 * Zero or undefined size values are placed at the beginning for ascending sorts
 */
function compareSize(sizeA: number | undefined, sizeB: number | undefined): number {
  const valueA = sizeA ?? 0
  const valueB = sizeB ?? 0

  // Handle zero/unknown values - they should come first in ascending order
  if (valueA === 0 && valueB === 0) return 0
  if (valueA === 0) return -1  // zero comes before any positive value
  if (valueB === 0) return 1   // any positive value comes after zero

  return valueA - valueB
}
