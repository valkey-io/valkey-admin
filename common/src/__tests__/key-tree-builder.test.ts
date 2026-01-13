import { describe, it, expect } from "vitest"
import { keyTreeBuilder, type KeyInfo, type KeyTreeBuilderOptions } from "../key-tree-builder"

describe("keyTreeBuilder with sorting", () => {
  const testKeys: KeyInfo[] = [
    { name: "zebra", type: "string", ttl: 100, size: 50 },
    { name: "apple", type: "string", ttl: -1, size: 25 },
    { name: "banana", type: "string", ttl: 200, size: 75 },
    { name: "alpha", type: "hash", ttl: 300, size: 100 },
    { name: "beta", type: "hash", ttl: 150, size: 80 },
  ]

  it("should build tree without sorting when no options provided", () => {
    const tree = keyTreeBuilder(testKeys)

    // Check that tree structure is built correctly - all keys should be direct children
    expect(tree.children.size).toBe(5) // zebra, apple, banana, alpha, beta
  })

  it("should sort leaf nodes by name when name sorting is specified", () => {
    const options: KeyTreeBuilderOptions = {
      sortOption: { field: "name", direction: "asc" },
    }
    const tree = keyTreeBuilder(testKeys, options)

    const rootChildren = Array.from(tree.children.keys())
    expect(rootChildren).toEqual(["alpha", "apple", "banana", "beta", "zebra"]) // sorted alphabetically
  })

  it("should sort leaf nodes by TTL when TTL sorting is specified", () => {
    const options: KeyTreeBuilderOptions = {
      sortOption: { field: "ttl", direction: "asc" },
    }
    const tree = keyTreeBuilder(testKeys, options)

    const rootChildren = Array.from(tree.children.keys())
    // TTL order: zebra(100), beta(150), banana(200), alpha(300), apple(-1)
    expect(rootChildren).toEqual(["zebra", "beta", "banana", "alpha", "apple"])
  })

  it("should sort leaf nodes by size when size sorting is specified", () => {
    const options: KeyTreeBuilderOptions = {
      sortOption: { field: "size", direction: "desc" },
    }
    const tree = keyTreeBuilder(testKeys, options)

    const rootChildren = Array.from(tree.children.keys())
    // Size order (desc): alpha(100), beta(80), banana(75), zebra(50), apple(25)
    expect(rootChildren).toEqual(["alpha", "beta", "banana", "zebra", "apple"])
  })

  it("should handle hierarchical keys with sorting", () => {
    const hierarchicalKeys: KeyInfo[] = [
      { name: "user:zebra", type: "string", ttl: 100, size: 50 },
      { name: "user:apple", type: "string", ttl: -1, size: 25 },
      { name: "user:banana", type: "string", ttl: 200, size: 75 },
      { name: "session:alpha", type: "hash", ttl: 300, size: 100 },
      { name: "session:beta", type: "hash", ttl: 150, size: 80 },
    ]

    const options: KeyTreeBuilderOptions = {
      sortOption: { field: "ttl", direction: "asc" },
    }
    const tree = keyTreeBuilder(hierarchicalKeys, options)

    // Parent nodes should be sorted by segment name
    const rootChildren = Array.from(tree.children.keys())
    expect(rootChildren).toEqual(["session", "user"]) // alphabetical order

    // Leaf nodes within each parent should be sorted by TTL
    const userNode = tree.children.get("user")!
    const userChildren = Array.from(userNode.children.keys())
    // TTL order: zebra(100), banana(200), apple(-1)
    expect(userChildren).toEqual(["zebra", "banana", "apple"])

    const sessionNode = tree.children.get("session")!
    const sessionChildren = Array.from(sessionNode.children.keys())
    // TTL order: beta(150), alpha(300)
    expect(sessionChildren).toEqual(["beta", "alpha"])
  })

  it("should handle empty keys array", () => {
    const options: KeyTreeBuilderOptions = {
      sortOption: { field: "name", direction: "asc" },
    }
    const tree = keyTreeBuilder([], options)

    expect(tree.children.size).toBe(0)
    expect(tree.isLeaf).toBe(false)
  })
})
