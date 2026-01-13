import { describe, it, expect } from "vitest"
import { sortKeys, type SortOption } from "../key-sorting"

interface KeyInfo {
  name: string
  type?: string
  ttl?: number
  size?: number
  collectionSize?: number
}

describe("sortKeys", () => {
  const testKeys: KeyInfo[] = [
    { name: "zebra", ttl: 100, size: 50 },
    { name: "apple", ttl: -1, size: 0 },
    { name: "Banana", ttl: 200, size: 25 },
    { name: "cherry", ttl: 50, size: 75 },
    { name: "date", ttl: undefined, size: undefined },
  ]

  describe("name sorting", () => {
    it("should sort names in ascending order (case-insensitive)", () => {
      const sortOption: SortOption = { field: "name", direction: "asc" }
      const result = sortKeys(testKeys, sortOption)

      const names = result.map((k) => k.name)
      expect(names).toEqual(["apple", "Banana", "cherry", "date", "zebra"])
    })

    it("should sort names in descending order (case-insensitive)", () => {
      const sortOption: SortOption = { field: "name", direction: "desc" }
      const result = sortKeys(testKeys, sortOption)

      const names = result.map((k) => k.name)
      expect(names).toEqual(["zebra", "date", "cherry", "Banana", "apple"])
    })
  })

  describe("TTL sorting", () => {
    it("should sort TTL in ascending order with -1 as highest", () => {
      const sortOption: SortOption = { field: "ttl", direction: "asc" }
      const result = sortKeys(testKeys, sortOption)

      const ttls = result.map((k) => k.ttl ?? -1)
      expect(ttls).toEqual([50, 100, 200, -1, -1]) // -1 values at end (highest)
    })

    it("should sort TTL in descending order with -1 as highest", () => {
      const sortOption: SortOption = { field: "ttl", direction: "desc" }
      const result = sortKeys(testKeys, sortOption)

      const ttls = result.map((k) => k.ttl ?? -1)
      expect(ttls).toEqual([-1, -1, 200, 100, 50]) // -1 values first in desc order
    })
  })

  describe("size sorting", () => {
    it("should sort size in ascending order with zero/undefined at beginning", () => {
      const sortOption: SortOption = { field: "size", direction: "asc" }
      const result = sortKeys(testKeys, sortOption)

      const sizes = result.map((k) => k.size ?? 0)
      expect(sizes).toEqual([0, 0, 25, 50, 75]) // zero and undefined first
    })

    it("should sort size in descending order", () => {
      const sortOption: SortOption = { field: "size", direction: "desc" }
      const result = sortKeys(testKeys, sortOption)

      const sizes = result.map((k) => k.size ?? 0)
      expect(sizes).toEqual([75, 50, 25, 0, 0]) // largest first
    })
  })

  describe("edge cases", () => {
    it("should handle empty array", () => {
      const sortOption: SortOption = { field: "name", direction: "asc" }
      const result = sortKeys([], sortOption)
      expect(result).toEqual([])
    })

    it("should handle single item", () => {
      const singleKey = [{ name: "test", ttl: 100, size: 50 }]
      const sortOption: SortOption = { field: "name", direction: "asc" }
      const result = sortKeys(singleKey, sortOption)
      expect(result).toEqual(singleKey)
    })

    it("should not mutate original array", () => {
      const originalKeys = [...testKeys]
      const sortOption: SortOption = { field: "name", direction: "asc" }
      sortKeys(testKeys, sortOption)
      expect(testKeys).toEqual(originalKeys)
    })
  })
})
