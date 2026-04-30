import { ChartPie } from "lucide-react"
import { Button } from "../../ui/button"
import { SearchInput } from "../../ui/search-input"
import { CountRangeFilter } from "./count-range-filter"
import { NodeFilterDropdown } from "./node-filter-dropdown"

interface HotKeysToolbarProps {
  isCluster?: boolean
  searchQuery: string
  onSearchChange: (v: string) => void
  onSearchClear: () => void
  nodes: string[]
  selectedNode: string
  onNodeSelect: (node: string) => void
  countMin: string
  countMax: string
  onCountMinChange: (v: string) => void
  onCountMaxChange: (v: string) => void
  dataMin: number
  dataMax: number
  onHeatmapOpen: () => void
}

export function HotKeysToolbar({
  isCluster,
  searchQuery, onSearchChange, onSearchClear,
  nodes, selectedNode, onNodeSelect,
  countMin, countMax, onCountMinChange, onCountMaxChange,
  dataMin, dataMax,
  onHeatmapOpen,
}: HotKeysToolbarProps) {
  return (
    <div className="flex items-center gap-2 w-full bg-accent p-2">
      {isCluster && (
        <Button
          className="font-normal shrink-0"
          onClick={onHeatmapOpen}
          type="button"
          variant="outline"
        >
          <ChartPie className="text-primary" />
          Node Heatmap
        </Button>
      )}

      <SearchInput
        onChange={(e) => onSearchChange(e.target.value)}
        onClear={onSearchClear}
        placeholder="Search keys..."
        value={searchQuery}
      />

      {isCluster && (
        <NodeFilterDropdown
          nodes={nodes}
          onSelect={onNodeSelect}
          selectedNode={selectedNode}
        />
      )}

      <CountRangeFilter
        countMax={countMax}
        countMin={countMin}
        dataMax={dataMax}
        dataMin={dataMin}
        onCountMaxChange={onCountMaxChange}
        onCountMinChange={onCountMinChange}
      />
    </div>
  )
}
