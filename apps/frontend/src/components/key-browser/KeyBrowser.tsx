import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import * as R from "ramda"
import { useParams } from "react-router"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { formatBytes } from "@common/src/bytes-conversion"
import { calculateTotalMemoryUsage } from "@common/src/memory-usage-calculation"
import {
  KeyRound,
  RefreshCw,
  ListFilter,
  ChartPie
} from "lucide-react"
import { truncateText } from "@common/src/truncate-text"
import { toScanPattern } from "@common/src/scan-pattern"
import { AppHeader } from "../ui/app-header"
import { ChartModal } from "../ui/chart-modal"
import DonutChart from "../ui/donut-chart"
import AddNewKey from "./add-key"
import KeyDetails from "./key-details/key-details"
import { KeyTree } from "./key-tree"
import { Button } from "../ui/button"
import { Select } from "../ui/select"
import { StatCard } from "../ui/stat-card"
import { SearchInput } from "../ui/search-input"
import RouteContainer from "../ui/route-container"
import { TooltipIcon } from "../ui/tooltip-icon"
import { Typography } from "../ui/typography"
import { SplitPanel } from "../ui/split-panel"
import { Panel } from "../ui/panel"
import { useAppDispatch } from "@/hooks/hooks"
import {
  selectKeys,
  selectLoading,
  selectError,
  selectKeyBrowserState,
  selectTotalKeys
} from "@/state/valkey-features/keys/keyBrowserSelectors"
import {
  getKeysRequested,
  loadMoreKeys,
  getKeyTypeRequested
} from "@/state/valkey-features/keys/keyBrowserSlice"
import { selectClusterAlias } from "@/state/valkey-features/connection/connectionSelectors"

interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any;
}

/** Renders filtered, incrementally loaded keys and dispatches browsing intents. */
export function KeyBrowser() {
  const { id, clusterId } = useParams()
  const dispatch = useAppDispatch()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false)
  const [isDistributionOpen, setIsDistributionOpen] = useState(false)
  const [searchPattern, setSearchPattern] = useState("")
  const [selectedType, setSelectedType] = useState<string>("all")
  const clusterAlias = useSelector(selectClusterAlias(id!))
  const keyTypes = [
    { value: "all", label: "All Key Types" },
    { value: "string", label: "String" },
    { value: "hash", label: "Hash" },
    { value: "list", label: "List" },
    { value: "set", label: "Set" },
    { value: "zset", label: "Zset" },
    { value: "stream", label: "Stream" },
    { value: "rejson-rl", label: "JSON" },
  ]

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (id) {
      dispatch(getKeysRequested({
        connectionId: id,
        pattern: toScanPattern(searchPattern),
        keyType: selectedType === "all" ? undefined : selectedType,
      }))
    }
  }

  const handleClearSearch = () => {
    setSearchPattern("")
    if (id) {
      dispatch(getKeysRequested({
        connectionId: id,
        pattern: "*",
        keyType: selectedType === "all" ? undefined : selectedType,
      }))
    }
  }

  const handleAddKeyModal = () => {
    setIsAddKeyOpen(!isAddKeyOpen)
  }

  const keys: KeyInfo[] = useSelector(selectKeys(id!))
  const loading = useSelector(selectLoading(id!))
  const error = useSelector(selectError(id!))
  const totalKeys = useSelector(selectTotalKeys(id!))
  const page = useSelector(selectKeyBrowserState(id!))
  const hasMore = Boolean(page.cursor && page.cursor !== "0")

  useEffect(() => {
    if (id) {
      dispatch(getKeysRequested({ connectionId: id! }))
    }
  }, [id, dispatch])

  const handleRefresh = () => {
    dispatch(getKeysRequested({
      connectionId: id!, pattern: toScanPattern(searchPattern), keyType: selectedType === "all" ? undefined : selectedType,
    }))
  }

  const handleKeyClick = (keyName: string) => {
    if (loading) return
    setSelectedKey(keyName)

    const keyInfo = keys.find((k) => k.name === keyName)
    if (R.isNotEmpty(keyInfo) && !keyInfo!.type) {
      dispatch(getKeyTypeRequested({ connectionId: id!, key: keyName }))
    }
  }

  // Get selected key info from the keys data
  const selectedKeyInfo = selectedKey
    ? keys.find((k) => k.name === selectedKey) ?? null
    : null

  // Calculate total memory usage
  const totalMemoryUsage = calculateTotalMemoryUsage(keys)

  return (
    <RouteContainer title="Key Browser">
      <AppHeader
        description={
          <>
            Add, View and Edit keys of{" "}
            {clusterId ? (
              <>
                cluster{" "} <span className="font-semibold text-primary">{truncateText(clusterAlias || clusterId!)}</span>
              </>
            ) : (
              <>instance <span className="font-semibold text-primary">{truncateText(id!)}</span></>
            )}
          </>
        }
        icon={<KeyRound size={20} />}
        title="Key Browser"
      />

      {error && (
        <Typography className="ml-2" variant="bodySm">
          Error loading keys: {error}
        </Typography>
      )}

      {/* Total Keys and Key Stats */}
      <TooltipProvider>
        <div className="flex justify-between gap-4">
          <StatCard
            className="flex-1"
            label="Total Keys"
            tooltip={
              <TooltipIcon description={`Total number of keys in the ${clusterId ? "cluster" : "instance"} "DBSIZE"`} size={14} />
            }
            value={totalKeys}
          />
          <StatCard
            className="flex-1"
            label="Memory Usage"
            tooltip={
              <TooltipIcon description="Memory used by keys sampled" size={14} />
            }
            value={formatBytes(totalMemoryUsage)}
          />
        </div>
      </TooltipProvider>
      {/* Search and Refresh */}
      <div className="flex items-center w-full gap-2">
        <Select
          className="w-48"
          disabled={loading}
          icon={<ListFilter size={16} />}
          onChange={(e) => {
            const keyType = e.target.value
            setSelectedType(keyType)
            dispatch(getKeysRequested({
              connectionId: id!, pattern: toScanPattern(searchPattern), keyType: keyType === "all" ? undefined : keyType,
            }))
          }}
          value={selectedType}
        >
          {keyTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>

        <Button
          className="font-normal"
          disabled={loading}
          onClick={() => setIsDistributionOpen(true)}
          type="button"
          variant={"outline"}
        >
          <ChartPie className="text-primary" /> Key Distribution Chart
        </Button>

        <form className="flex-1" onSubmit={handleSearch}>
          <SearchInput
            disabled={loading}
            onChange={(e) => setSearchPattern(e.target.value)}
            onClear={handleClearSearch}
            placeholder="Search keys (supports glob: * ? [ ])"
            value={searchPattern}
          />
        </form>

        <Button
          disabled={loading}
          onClick={handleAddKeyModal}
          type="button"
        >
          + Add Key
        </Button>

        <Button
          aria-label="Refresh keys"
          disabled={loading}
          onClick={handleRefresh}
          size="icon"
          type="button"
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* Add Key Modal */}
      {isAddKeyOpen && <AddNewKey onClose={handleAddKeyModal} />}

      {/* Key Type Distribution Modal */}
      <ChartModal
        onClose={() => setIsDistributionOpen(false)}
        open={isDistributionOpen}
        subtitle="Memory and count breakdown by key type"
        title="Key Type Distribution"
      >
        <DonutChart />
      </ChartModal>

      {/* Key Viewer */}
      <TooltipProvider>
        <SplitPanel
          left={
            <Panel
              emptyState={selectedType === "all" ? "No keys found" : `No ${selectedType} keys found`}
              isEmpty={keys.length === 0 && !loading && !hasMore && !error}
              loading={loading}
            >
              <KeyTree
                error={error}
                hasMore={hasMore}
                keys={keys}
                loading={loading}
                onKeyClick={handleKeyClick}
                onLoadMore={() => dispatch(loadMoreKeys({ connectionId: id! }))}
                pageLoading={page.pageLoading}
                restartRequired={page.restartRequired}
                selectedKey={selectedKey}
              />
            </Panel>
          }
          right={
            <KeyDetails connectionId={id!} readOnly={false}
              selectedKey={selectedKey} selectedKeyInfo={selectedKeyInfo} setSelectedKey={setSelectedKey} />
          }
          rightClassName=""
        />
      </TooltipProvider>
    </RouteContainer>
  )
}
