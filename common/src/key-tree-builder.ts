import { sortKeys, type SortOption } from "./key-sorting"

export interface KeyInfo {
  name: string
  type: string
  ttl: number
  size: number
  collectionSize?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any
}

export interface TreeNode {
  segment: string
  fullPath: string
  children: Map<string, TreeNode>
  key?: KeyInfo
  isLeaf: boolean
}

export interface KeyTreeBuilderOptions {
  sortOption?: SortOption
}

const DELIMITERS = [":", ".", "|"] as const

function detectDelimiter(keyName: string): string {
  return DELIMITERS.find((delim) => keyName.includes(delim)) || ":"
}

export function keyTreeBuilder(keys: KeyInfo[], options?: KeyTreeBuilderOptions): TreeNode {
  const root: TreeNode = {
    segment: "",
    fullPath: "",
    children: new Map(),
    isLeaf: false,
  }

  for (const keyInfo of keys) {
    const delimiter = detectDelimiter(keyInfo.name)
    const segments = keyInfo.name.split(delimiter)
    let currentNode = root

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      const isLastSegment = i === segments.length - 1
      const fullPath = segments.slice(0, i + 1).join(delimiter)

      if (!currentNode.children.has(segment)) {
        currentNode.children.set(segment, {
          segment,
          fullPath,
          children: new Map(),
          isLeaf: false,
        })
      }

      currentNode = currentNode.children.get(segment)!

      if (isLastSegment) {
        currentNode.isLeaf = true
        currentNode.key = keyInfo
      }
    }
  }

  // Apply sorting to leaf nodes within each parent if sort option is provided
  if (options?.sortOption) {
    applySortingToTree(root, options.sortOption)
  }

  return root
}

/**
 * Recursively applies sorting to leaf nodes within each parent node
 * Parent nodes remain sorted by segment name, but leaf keys are sorted by the specified criteria
 */
function applySortingToTree(node: TreeNode, sortOption: SortOption): void {
  // Collect all leaf children and non-leaf children separately
  const leafChildren: Array<{ key: string; node: TreeNode }> = []
  const nonLeafChildren: Array<{ key: string; node: TreeNode }> = []

  for (const [key, childNode] of node.children.entries()) {
    if (childNode.isLeaf && childNode.key) {
      leafChildren.push({ key, node: childNode })
    } else {
      nonLeafChildren.push({ key, node: childNode })
      // Recursively apply sorting to child nodes
      applySortingToTree(childNode, sortOption)
    }
  }

  // Only rebuild if we have leaf children to sort
  if (leafChildren.length > 0) {
    const leafKeys = leafChildren.map((child) => child.node.key!).filter(Boolean)
    const sortedLeafKeys = sortKeys(leafKeys, sortOption)

    // Rebuild the children map with sorted leaf nodes
    const newChildren = new Map<string, TreeNode>()

    // Add non-leaf children first (sorted by segment name)
    nonLeafChildren
      .sort((a, b) => a.key.localeCompare(b.key))
      .forEach(({ key, node }) => {
        newChildren.set(key, node)
      })

    // Add sorted leaf children
    sortedLeafKeys.forEach((keyInfo) => {
      const childEntry = leafChildren.find((child) => child.node.key?.name === keyInfo.name)
      if (childEntry) {
        newChildren.set(childEntry.key, childEntry.node)
      }
    })

    node.children = newChildren
  } else if (nonLeafChildren.length > 0) {
    // If we only have non-leaf children, ensure they're sorted by segment name
    const newChildren = new Map<string, TreeNode>()
    nonLeafChildren
      .sort((a, b) => a.key.localeCompare(b.key))
      .forEach(({ key, node }) => {
        newChildren.set(key, node)
      })
    node.children = newChildren
  }
}

export function countKeys(node: TreeNode): number {
  let count = node.isLeaf && node.key ? 1 : 0
  for (const child of node.children.values()) {
    count += countKeys(child)
  }
  return count
}
