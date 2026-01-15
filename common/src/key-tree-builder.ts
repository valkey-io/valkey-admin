interface KeyInfo {
  name: string
  type: string
  ttl: number
  size: number
  collectionSize?: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any
}

interface TreeNode {
  segment: string
  fullPath: string
  children: Map<string, TreeNode>
  key?: KeyInfo
  isLeaf: boolean
}

const DELIMITERS = [":", ".", "|"] as const

function detectDelimiter(keyName: string): string {
  return DELIMITERS.find((delim) => keyName.includes(delim)) || ":"
}

export function keyTreeBuilder(keys: KeyInfo[]): TreeNode {
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

  return root
}

export function countKeys(node: TreeNode): number {
  let count = node.isLeaf && node.key ? 1 : 0
  for (const child of node.children.values()) {
    count += countKeys(child)
  }
  return count
}
