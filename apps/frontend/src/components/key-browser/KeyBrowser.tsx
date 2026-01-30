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
  ListFilter
} from "lucide-react"
import { calculateHitRatio } from "@common/src/cache-hit-ratio"
import { AppHeader } from "../ui/app-header"
import AddNewKey from "./add-key"
import KeyDetails from "./key-details/key-details"
import { KeyTree } from "./key-tree"
import { Button } from "../ui/button"
import { Select } from "../ui/select"
import { StatCard } from "../ui/stat-card"
import { SearchInput } from "../ui/search-input"
import RouteContainer from "../ui/route-container"
import { TooltipIcon } from "../ui/tooltip-icon"
import { SplitPanel } from "../ui/split-panel"
import { Panel } from "../ui/panel"
import { useAppDispatch } from "@/hooks/hooks"
import {
  selectKeys,
  selectLoading,
  selectError,
  selectTotalKeys
} from "@/state/valkey-features/keys/keyBrowserSelectors"
import {
  getKeysRequested,
  getKeyTypeRequested
} from "@/state/valkey-features/keys/keyBrowserSlice"
import { selectData } from "@/state/valkey-features/info/infoSelectors"

interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any;
}

export function KeyBrowser() {
  const { id } = useParams()
  const dispatch = useAppDispatch()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false)
  const [searchPattern, setSearchPattern] = useState("")
  const [selectedType, setSelectedType] = useState<string>("all")
  const infoData = useSelector(selectData(id!)) || {}

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
        pattern: searchPattern || "*",
      }))
    }
  }

  const handleClearSearch = () => {
    setSearchPattern("")
    if (id) {
      dispatch(getKeysRequested({
        connectionId: id,
        pattern: "*",
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

  useEffect(() => {
    if (id) {
      dispatch(getKeysRequested({ connectionId: id! }))
    }
  }, [id, dispatch])

  const handleRefresh = () => {
    dispatch(getKeysRequested({ connectionId: id! }))
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
    ? keys.find((k) => k.name === selectedKey)
    : null

  // Calculate total memory usage
  const totalMemoryUsage = calculateTotalMemoryUsage(keys)

  const filteredKeys = selectedType === "all"
    ? keys
    : keys.filter((key) => key.type.toLowerCase() === selectedType.toLowerCase())

  const hitRateData = {
    keyspace_hits: infoData.keyspace_hits,
    keyspace_misses: infoData.keyspace_misses,
  }

  const operationsData = {
    // infoData.instantaneous_ops_per_sec is another option
    total_commands : infoData.total_commands_processed,
  }

  return (
    <RouteContainer title="Key Browser">
      <AppHeader icon={<KeyRound size={20} />} title="Key Browser" />

      {error && <div className="ml-2">Error loading keys: {error}</div>}

      {/* Total Keys and Key Stats */}
      <TooltipProvider>
        <div className="flex justify-between gap-4">
          <StatCard
            className="flex-1"
            label="Total Keys"
            tooltip={
              <TooltipIcon description="Total number of keys in the database" size={14}/>
            }
            value={totalKeys}
          />
          <StatCard
            className="flex-1"
            label="Memory Usage"
            tooltip={
              <TooltipIcon description="Memory used by all keys in the database" size={14}/>
            }
            value={formatBytes(totalMemoryUsage)}
          />
          <StatCard
            className="flex-1"
            label="Operations"
            tooltip={
              <TooltipIcon description="Total number of commands processed" size={14}/>
            }
            value={operationsData.total_commands}
          />
          <StatCard
            className="flex-1"
            label="Hit Ratio"
            tooltip={
              <TooltipIcon description="Ratio of key lookups that resulted in a cache hit" size={14} />
            }
            value={calculateHitRatio(Number(hitRateData.keyspace_hits) || 0, Number(hitRateData.keyspace_misses) || 0)}
          />
        </div>
      </TooltipProvider>
      {/* Search and Refresh */}
      <div className="flex items-center w-full gap-2">
        <Select
          className="w-48"
          disabled={loading}
          icon={<ListFilter size={16} />}
          onChange={(e) => setSelectedType(e.target.value)}
          value={selectedType}
        >
          {keyTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>

        <form className="flex-1" onSubmit={handleSearch}>
          <SearchInput
            disabled={loading}
            onChange={(e) => setSearchPattern(e.target.value)}
            onClear={handleClearSearch}
            placeholder="Search keys (use * to search patterns like user:*)"
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

      {/* Key Viewer */}
      <TooltipProvider>
        <SplitPanel
          left={
            <Panel
              emptyState={selectedType === "all" ? "No keys found" : `No ${selectedType} keys found`}
              isEmpty={filteredKeys.length === 0 && !loading}
              loading={loading}
            >
              <KeyTree
                keys={filteredKeys}
                loading={loading}
                onKeyClick={handleKeyClick}
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
