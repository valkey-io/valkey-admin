import { useState } from "react"
import { ChevronRight, ChevronDown, Key, Database, Hourglass } from "lucide-react"
import { convertTTL } from "@common/src/ttl-conversion"
import { formatBytes } from "@common/src/bytes-conversion"
import { keyTreeBuilder, countKeys } from "@common/src/key-tree-builder"
import { CustomTooltip } from "../ui/tooltip"

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

interface KeyTreeProps {
  keys: KeyInfo[]
  selectedKey: string | null
  onKeyClick: (keyName: string) => void
  loading: boolean
}

interface TreeNodeItemProps {
  node: TreeNode
  level: number
  selectedKey: string | null
  onKeyClick: (keyName: string) => void
  loading: boolean
}

function TreeNodeItem({ node, level, selectedKey, onKeyClick, loading }: TreeNodeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasChildren = node.children.size > 0
  const keyCount = countKeys(node)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasChildren) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleClick = () => {
    if (loading) return
    if (node.isLeaf && node.key) {
      onKeyClick(node.key.name)
    } else if (hasChildren) {
      setIsExpanded(!isExpanded)
    }
  }

  const isSelected = node.isLeaf && node.key && selectedKey === node.key.name

  // to make top level nodes similar to other keys
  const showBorder = level === 0

  return (
    <div>
      <div
        className={`${showBorder ? "h-16 p-2 dark:border-tw-dark-border border hover:bg-tw-primary/30 cursor-pointer rounded" 
          : "py-1 px-2 cursor-pointer hover:bg-tw-primary/10 rounded text-sm"} flex items-center gap-2 justify-between ${
          isSelected ? "bg-tw-primary/80 hover:bg-tw-primary/80" : ""
        }`}
        onClick={handleClick}
      >
        <div className="items-center gap-2 flex-1 min-w-0 flex">
          {/* Expand/Collapse Icon */}
          <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center" onClick={handleToggle}>
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="text-tw-primary" size={16} />
              ) : (
                <ChevronRight className="text-tw-primary" size={16} />
              )
            ) : (
              <span className="inline-block w-4" />
            )}
          </div>

          {/* Tree Connector for nested items */}
          {!showBorder && (
            <div className="flex-shrink-0 w-6 h-4 relative">
              <div className="absolute left-0 top-0 w-full h-full border-l-2 border-b-2 border-tw-primary/30 rounded-bl"
                style={{ borderBottomWidth: "2px", borderLeftWidth: "2px" }} />
            </div>
          )}

          {/* Key/Node Info */}
          <div className="flex flex-col flex-1 min-w-0">
            <span className="flex items-center gap-2">
              {node.isLeaf && <Key size={16} />}
              <span className="truncate">{node.segment}</span>
              {!node.isLeaf && (
                <span className={`text-xs ${isSelected ? "text-white" : "text-tw-primary"}`}>
                  ({keyCount})
                </span>
              )}
            </span>
            {node.isLeaf && node.key && (
              <div className={`ml-6 text-xs font-light uppercase text-tw-primary ${isSelected ? "text-white" : ""}`}>
                {node.key.type === "ReJSON-RL" ? "json" : node.key.type}
              </div>
            )}
          </div>
        </div>

        {/* key ttl and size only for leaf nodes */}
        {node.isLeaf && node.key && (
          <div className="flex items-center gap-1 text-xs">
            {node.key.size && (
              <CustomTooltip content="Size">
                <span
                  className={`flex items-center justify-between gap-1 text-xs px-2 py-1
                   text-tw-primary ${isSelected ? "text-white" : ""} dark:text-white`}
                >
                  <Database
                    className="text-white bg-tw-primary p-1 rounded-full"
                    size={20}
                  />{" "}
                  {formatBytes(node.key.size)}
                </span>
              </CustomTooltip>
            )}
            <CustomTooltip content="TTL">
              <span
                className={`flex items-center justify-between gap-1 text-xs px-2 py-1
                  text-tw-primary ${isSelected ? "text-white" : ""} dark:text-white`}
              >
                <Hourglass
                  className="text-white bg-tw-primary p-1 rounded-full"
                  size={20}
                />{" "}
                {convertTTL(node.key.ttl)}
              </span>
            </CustomTooltip>
          </div>
        )}
      </div>

      {/* expanding container */}
      {hasChildren && isExpanded && (
        <div className={showBorder ? "mt-1 border-l-2 border-tw-primary/40 pl-2" : "ml-2 border-l-2 border-tw-primary/30 pl-2"}>
          {Array.from(node.children.values()).map((child) => (
            <TreeNodeItem
              key={child.fullPath}
              level={level + 1}
              loading={loading}
              node={child}
              onKeyClick={onKeyClick}
              selectedKey={selectedKey}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function KeyTree({ keys, selectedKey, onKeyClick, loading }: KeyTreeProps) {
  const tree = keyTreeBuilder(keys)

  return (
    <div className="h-full overflow-y-auto space-y-2 p-2">
      {Array.from(tree.children.values()).map((node) => (
        <TreeNodeItem
          key={node.fullPath}
          level={0}
          loading={loading}
          node={node}
          onKeyClick={onKeyClick}
          selectedKey={selectedKey}
        />
      ))}
    </div>
  )
}
