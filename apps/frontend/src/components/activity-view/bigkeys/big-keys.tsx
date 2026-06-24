import { useState } from "react"
import { AlertCircle, KeyRound } from "lucide-react"
import * as R from "ramda"
import { EmptyState } from "../../ui/empty-state"
import { LoadingState } from "../../ui/loading-state"
import { Typography } from "../../ui/typography"
import { SearchInput } from "../../ui/search-input"
import { type SortOrder } from "../../ui/sortable-table-header"
import { NodeErrorsBanner } from "../hotkeys/hot-keys-banners"
import { NodeFilterDropdown } from "../hotkeys/node-filter-dropdown"
import { BigKeysTable } from "./big-keys-table"
import type { BigKey } from "@/state/valkey-features/bigkeys/bigKeysSlice"

interface BigKeysProps {
  data: BigKey[] | null
  errorMessage: string | null
  status?: string
  nodeErrors?: { connectionId: string; error: string }[]
  isCluster?: boolean
  onKeyClick?: (keyName: string) => void
  selectedKey?: string | null
}

export function BigKeys({
  data, errorMessage, status, nodeErrors, isCluster, onKeyClick, selectedKey,
}: BigKeysProps) {
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedNode, setSelectedNode] = useState("all")

  if (status === "Pending") return <LoadingState message="Scanning for big keys..." />

  const sorted = R.sort<BigKey>(
    (sortOrder === "asc" ? R.ascend : R.descend)((k) => k.sizeBytes),
    R.defaultTo([], data),
  )

  const uniqueNodes = Array.from(
    new Set(sorted.map((k) => k.nodeId).filter(Boolean)),
  ) as string[]

  const filtered = sorted.filter((k) => {
    const matchesSearch = !searchQuery || k.key.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesNode = selectedNode === "all" || k.nodeId === selectedNode
    return matchesSearch && matchesNode
  })

  const banner = nodeErrors && nodeErrors.length > 0 && <NodeErrorsBanner nodeErrors={nodeErrors} />

  if (sorted.length === 0) {
    return (
      <>
        {banner}
        <EmptyState
          action={
            errorMessage && (
              <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <Typography variant="bodySm">{errorMessage}</Typography>
              </div>
            )
          }
          icon={<KeyRound size={48} />}
          title="No Big Keys Found"
        />
      </>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {banner}
      <div className="flex items-center gap-2 w-full bg-accent p-2">
        <SearchInput
          onChange={(e) => setSearchQuery(e.target.value)}
          onClear={() => setSearchQuery("")}
          placeholder="Search keys..."
          value={searchQuery}
        />
        {isCluster && (
          <NodeFilterDropdown
            align="right"
            nodes={uniqueNodes}
            onSelect={setSelectedNode}
            selectedNode={selectedNode}
          />
        )}
      </div>
      <div className="flex-1 min-h-0">
        <BigKeysTable
          onKeyClick={onKeyClick}
          onToggleSort={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
          rows={filtered}
          searchQuery={searchQuery}
          selectedKey={selectedKey}
          selectedNode={selectedNode}
          sortOrder={sortOrder}
        />
      </div>
    </div>
  )
}
