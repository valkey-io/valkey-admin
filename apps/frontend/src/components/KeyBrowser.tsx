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
  Search,
  ListFilter,
  CircleX,
  CircleQuestionMark
} from "lucide-react"
import { calculateHitRatio } from "@common/src/cache-hit-ratio"
import { AppHeader } from "./ui/app-header"
import AddNewKey from "./ui/add-key"
import KeyDetails from "./ui/key-details"
import { KeyTree } from "./ui/key-tree"
import { CustomTooltip } from "./ui/custom-tooltip"
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
    <div className="flex flex-col h-screen p-4">
      <AppHeader icon={<KeyRound size={20} />} title="Key Browser" />

      {error && <div className="ml-2">Error loading keys: {error}</div>}

      {/* Total Keys and Key Stats */}
      <TooltipProvider>
        <div className="flex justify-between mb-8">
          <div className="h-20 w-1/4 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
            <span className="text-2xl font-semibold">{totalKeys}</span>
            <span className="font-light text-sm flex items-center gap-1">Total Keys
              <CustomTooltip description="Total number of keys in the database">
                <CircleQuestionMark className="bg-tw-primary/10 rounded-full text-tw-primary" size={14} />
              </CustomTooltip>
            </span>
          </div>
          <div className="h-20 w-1/4 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
            <span className="text-2xl font-semibold">
              {formatBytes(totalMemoryUsage)}
            </span>
            <span className="font-light text-sm flex items-center gap-1">Memory Usage
              <CustomTooltip description="Memory used by all keys in the database">
                <CircleQuestionMark className="bg-tw-primary/10 rounded-full text-tw-primary" size={14} />
              </CustomTooltip>
            </span>
          
          </div>
          <div className="h-20 w-1/4 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
            <span className="text-2xl font-semibold">{operationsData.total_commands}</span>
            <span className="font-light text-sm flex items-center gap-1">Operations
              <CustomTooltip description="Total number of commands processed">
                <CircleQuestionMark className="bg-tw-primary/10 rounded-full text-tw-primary" size={14} />
              </CustomTooltip>
            </span>
          </div>
          <div className="h-20 w-1/5 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
            <span className="text-2xl font-semibold">
              {calculateHitRatio(Number(hitRateData.keyspace_hits) || 0, Number(hitRateData.keyspace_misses) || 0)}
            </span>
            <span className="font-light text-sm flex items-center gap-1">Hit Ratio
              <CustomTooltip description="Ratio of key lookups that resulted in a cache hit" side="bottom">
                <CircleQuestionMark className="bg-tw-primary/10 rounded-full text-tw-primary" size={14} />
              </CustomTooltip>
            </span>
          </div>
        </div>
      </TooltipProvider>
      {/* Search and Refresh */}
      <div className="flex items-center w-full mb-4 text-sm font-light">
        <div className="h-10 mr-2 px-4 py-2 dark:border-tw-dark-border border rounded bg-white dark:bg-gray-800">
          <ListFilter className="inline mr-2" />
          <select
            className="flex-1 bg-transparent outline-none px-1"
            disabled={loading}
            onChange={(e) => setSelectedType(e.target.value)}
            value={selectedType}
          >
            {keyTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
        <form className="flex items-center justify-between flex-1 h-10 p-2 dark:border-tw-dark-border border rounded" onSubmit={handleSearch}>
          <button className={`mr-1 ${!searchPattern ? "invisible" : "text-tw-primary"}`} onClick={handleClearSearch} type="button">
            <CircleX size={14} />
          </button>
          <input
            className="flex-1 bg-transparent outline-none"
            disabled={loading}
            onChange={(e) => setSearchPattern(e.target.value)}
            placeholder="Search keys (use * to search patterns like user:*)"
            value={searchPattern}
          />
          <button
            className="text-tw-primary/80 hover:text-tw-primary"
            disabled={loading}
            type="submit"><Search /></button>
        </form>
        <button
          className="h-10 ml-2 px-4 py-2 bg-tw-primary text-white rounded "
          disabled={loading}
          onClick={handleAddKeyModal}
        >
          + Add Key
        </button>
        <button
          className="h-10 ml-2 px-4 py-2 bg-tw-primary text-white rounded"
          disabled={loading}
          onClick={handleRefresh}
        >
          <RefreshCw className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Add Key Modal */}
      {isAddKeyOpen && <AddNewKey onClose={handleAddKeyModal} />}

      {/* Key Viewer */}
      <TooltipProvider>
        <div className="flex flex-1 min-h-0">
          {/* Keys List */}
          <div className="w-1/2 pr-2">
            {filteredKeys.length === 0 && !loading ? (
              <div className="h-full p-2 dark:border-tw-dark-border border rounded flex items-center justify-center">
                {selectedType === "all" ? "No keys found" : `No ${selectedType} keys found`}
              </div>
            ) : (
              <div className={`h-full dark:border-tw-dark-border border rounded overflow-hidden ${loading ? "opacity-50 pointer-events-none" : ""}`}>
                <KeyTree
                  keys={filteredKeys}
                  loading={loading}
                  onKeyClick={handleKeyClick}
                  selectedKey={selectedKey}
                />
              </div>
            )}
          </div>
          {/* Key Details */}
          <KeyDetails connectionId={id!} selectedKey={selectedKey} selectedKeyInfo={selectedKeyInfo!} setSelectedKey={setSelectedKey} />
        </div>
      </TooltipProvider>
    </div>
  )
}
