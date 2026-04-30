import { useState } from "react"
import { AlertCircle, Flame } from "lucide-react"
import * as R from "ramda"
import { EmptyState } from "../../ui/empty-state"
import { LoadingState } from "../../ui/loading-state"
import { Typography } from "../../ui/typography"
import { type SortOrder } from "../../ui/sortable-table-header"
import { HotKeysHeatmapModal } from "./hot-keys-heatmap"
import { MonitorNotRunningBanner, NodeErrorsBanner } from "./hot-keys-banners"
import { HotKeysToolbar } from "./hot-keys-toolbar"
import { HotKeysTable } from "./hot-keys-table"

export type HotKeyEntry = [string, number, number | null, number, string?]

interface HotKeysProps {
  data: HotKeyEntry[] | null
  errorMessage: string | null
  status?: string
  monitorRunning?: boolean
  nodeErrors?: { connectionId: string; error: string }[]
  isCluster?: boolean
  onKeyClick?: (keyName: string) => void
  onStartMonitoring?: () => void
  selectedKey?: string | null
}

export function HotKeys({
  data, errorMessage, status, monitorRunning, nodeErrors,
  isCluster, onKeyClick, onStartMonitoring, selectedKey,
}: HotKeysProps) {
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedNode, setSelectedNode] = useState("all")
  const [countMin, setCountMin] = useState("")
  const [countMax, setCountMax] = useState("")
  const [isHeatmapOpen, setIsHeatmapOpen] = useState(false)

  if (status === "Pending") return <LoadingState message="Loading hot keys..." />

  const sorted = R.sort<HotKeyEntry>(
    (sortOrder === "asc" ? R.ascend : R.descend)(R.nth(1) as (t: HotKeyEntry) => number),
    R.defaultTo([], data),
  )

  const uniqueNodes = Array.from(
    new Set(sorted.map(([, , , , nodeId]) => nodeId).filter(Boolean)),
  ) as string[]

  const dataMin = sorted.length > 0 ? Math.min(...sorted.map(([, count]) => count)) : 0
  const dataMax = sorted.length > 0 ? Math.max(...sorted.map(([, count]) => count)) : 0
  const parsedCountMin = countMin !== "" ? Number(countMin) : null
  const parsedCountMax = countMax !== "" ? Number(countMax) : null
  const isCountFiltered = parsedCountMin !== null || parsedCountMax !== null

  const filtered = sorted.filter(([keyName, count, , , nodeId]) => {
    const matchesSearch = !searchQuery || keyName.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesNode = selectedNode === "all" || nodeId === selectedNode
    const matchesMin = parsedCountMin === null || count >= parsedCountMin
    const matchesMax = parsedCountMax === null || count <= parsedCountMax
    return matchesSearch && matchesNode && matchesMin && matchesMax
  })

  const banners = (
    <>
      {!monitorRunning && onStartMonitoring && (
        <MonitorNotRunningBanner onStartMonitoring={onStartMonitoring} />
      )}
      {nodeErrors && nodeErrors.length > 0 && (
        <NodeErrorsBanner nodeErrors={nodeErrors} />
      )}
    </>
  )

  if (sorted.length === 0) {
    return (
      <>
        {banners}
        <EmptyState
          action={
            (errorMessage || (!monitorRunning && onStartMonitoring)) && (
              <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <Typography variant="bodySm">
                  {!monitorRunning && onStartMonitoring ? (
                    <>
                      Monitor is not running.{" "}
                      <button
                        className="text-primary underline hover:opacity-80"
                        onClick={onStartMonitoring}
                        type="button"
                      >
                        Start MONITOR
                      </button>
                    </>
                  ) : (
                    errorMessage
                  )}
                </Typography>
              </div>
            )
          }
          icon={<Flame size={48} />}
          title="No Hot Keys Found"
        />
      </>
    )
  }

  return (
    <>
      {banners}
      <HotKeysHeatmapModal
        data={sorted}
        onClose={() => setIsHeatmapOpen(false)}
        open={isHeatmapOpen}
      />
      <HotKeysToolbar
        countMax={countMax}
        countMin={countMin}
        dataMax={dataMax}
        dataMin={dataMin}
        isCluster={isCluster}
        nodes={uniqueNodes}
        onCountMaxChange={setCountMax}
        onCountMinChange={setCountMin}
        onHeatmapOpen={() => setIsHeatmapOpen(true)}
        onNodeSelect={setSelectedNode}
        onSearchChange={setSearchQuery}
        onSearchClear={() => setSearchQuery("")}
        searchQuery={searchQuery}
        selectedNode={selectedNode}
      />
      <HotKeysTable
        dataMax={dataMax}
        dataMin={dataMin}
        isCountFiltered={isCountFiltered}
        onKeyClick={onKeyClick}
        onToggleSort={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
        parsedCountMax={parsedCountMax}
        parsedCountMin={parsedCountMin}
        rows={filtered}
        searchQuery={searchQuery}
        selectedKey={selectedKey}
        selectedNode={selectedNode}
        sortOrder={sortOrder}
      />
    </>
  )
}
