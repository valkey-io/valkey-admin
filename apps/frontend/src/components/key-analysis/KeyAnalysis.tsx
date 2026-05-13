import { useEffect, useState } from "react"
import { useSelector, useDispatch } from "react-redux"
import { useParams } from "react-router"
import { BarChart3, Database, Hash, HardDrive, RefreshCw } from "lucide-react"
import { formatBytes } from "@common/src/bytes-conversion"
import RouteContainer from "@/components/ui/route-container"
import { AppHeader } from "@/components/ui/app-header"
import { StatCard } from "@/components/ui/stat-card"
import { TabGroup } from "@/components/ui/tab-group"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Button } from "@/components/ui/button"
import {
  analysisRequested,
  selectAnalysisStatus,
  selectAnalysisKeys,
  selectAnalysisTotalKeys,
  selectAnalysisScannedKeys,
  selectAnalysisTotalMemory,
  selectAnalysisProgress,
  selectAnalysisError,
} from "@/state/valkey-features/key-analysis/keyAnalysisSlice"
import { BigKeysTable } from "./BigKeysTable"
import { PrefixMemoryTable } from "./PrefixMemoryTable"
import type { AppDispatch } from "@/store.ts"

type TabId = "big-keys" | "prefix-memory"

export function KeyAnalysis() {
  const { id, clusterId } = useParams<{ id: string; clusterId: string }>()
  const connectionId = clusterId ?? id ?? ""
  const dispatch = useDispatch<AppDispatch>()

  const status = useSelector(selectAnalysisStatus(connectionId))
  const keys = useSelector(selectAnalysisKeys(connectionId))
  const totalKeys = useSelector(selectAnalysisTotalKeys(connectionId))
  const scannedKeys = useSelector(selectAnalysisScannedKeys(connectionId))
  const totalMemory = useSelector(selectAnalysisTotalMemory(connectionId))
  const progress = useSelector(selectAnalysisProgress(connectionId))
  const error = useSelector(selectAnalysisError(connectionId))

  const [activeTab, setActiveTab] = useState<TabId>("big-keys")

  useEffect(() => {
    if (id) {
      dispatch(analysisRequested({ connectionId }))
    }
  }, [id, connectionId, dispatch])

  const handleRefresh = () => {
    if (id) {
      dispatch(analysisRequested({ connectionId }))
    }
  }

  const isLoading = status === "Pending"
  const largestKey = keys.length > 0 ? keys[0] : null

  const progressPercent =
    progress.totalEstimated > 0
      ? Math.round((progress.scannedCount / progress.totalEstimated) * 100)
      : 0

  return (
    <RouteContainer>
      <AppHeader
        description="Analyze key memory usage and identify large keys"
        icon={<BarChart3 size={24} />}
        title="Key Analysis"
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Database size={16} />}
          label="Total Keys"
          value={totalKeys.toLocaleString()}
        />
        <StatCard
          icon={<Hash size={16} />}
          label="Scanned"
          value={scannedKeys.toLocaleString()}
        />
        <StatCard
          icon={<HardDrive size={16} />}
          label="Total Memory"
          value={formatBytes(totalMemory)}
        />
        <StatCard
          icon={<BarChart3 size={16} />}
          label="Largest Key"
          value={largestKey ? formatBytes(largestKey.memoryUsage) : "-"}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <TabGroup
          activeTab={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "big-keys" as TabId, label: "Big Keys" },
            { id: "prefix-memory" as TabId, label: "Prefix Memory" },
          ]}
        />
        <Button
          className="flex items-center gap-1"
          disabled={isLoading}
          onClick={handleRefresh}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCw
            className={isLoading ? "animate-spin" : ""}
            size={16}
          />
          Refresh
        </Button>
      </div>

      {/* Content */}
      {isLoading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <LoadingState message={`Analyzing keys... ${progressPercent}% (${progress.phase})`} />
          <div className="w-64 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {progress.scannedCount.toLocaleString()} / {progress.totalEstimated.toLocaleString()} keys ({progress.phase})
          </p>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-500">Error: {error}</p>
        </div>
      )}

      {!isLoading && !error && keys.length === 0 && status !== "Idle" && (
        <EmptyState
          description="No keys found in the database"
          icon={<Database size={48} />}
          title="No Keys Found"
        />
      )}

      {!isLoading && !error && keys.length > 0 && (
        <div className="flex-1 min-h-0">
          {activeTab === "big-keys" && (
            <BigKeysTable keys={keys} loading={isLoading} />
          )}
          {activeTab === "prefix-memory" && (
            <PrefixMemoryTable keys={keys} totalMemory={totalMemory} />
          )}
        </div>
      )}
    </RouteContainer>
  )
}
