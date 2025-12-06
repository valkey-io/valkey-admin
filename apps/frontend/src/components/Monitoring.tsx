import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { Activity, RefreshCcw } from "lucide-react"
import { useParams } from "react-router"
import { COMMANDLOG_TYPE } from "@common/src/constants"
import * as R from "ramda"
import { AppHeader } from "./ui/app-header"
import { HotKeys } from "./ui/hot-keys"
import { SlowLogs } from "./ui/slow-logs"
import KeyDetails from "./ui/key-details"
import type { RootState } from "@/store"
import { commandLogsRequested, selectCommandLogs } from "@/state/valkey-features/commandlogs/commandLogsSlice"
import { useAppDispatch } from "@/hooks/hooks"
import { hotKeysRequested, selectHotKeys, selectHotKeysStatus } from "@/state/valkey-features/hotkeys/hotKeysSlice"
import { getKeyTypeRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { selectKeys } from "@/state/valkey-features/keys/keyBrowserSelectors"

type TabType = "hot-keys" | "command-logs"

interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  elements?: any;
}

export const Monitoring = () => {
  const dispatch = useAppDispatch()
  const { id } = useParams()
  const [activeTab, setActiveTab] = useState<TabType>("hot-keys")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const commandLogsSlowData = useSelector((state: RootState) => selectCommandLogs(id!, COMMANDLOG_TYPE.SLOW)(state))
  const hotKeysData = useSelector((state: RootState) => selectHotKeys(id!)(state))
  const hotKeysStatus = useSelector((state: RootState) => selectHotKeysStatus(id!)(state))
  const keys: KeyInfo[] = useSelector(selectKeys(id!))

  useEffect(() => {
    if (id) {
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.SLOW }))
      dispatch(hotKeysRequested({ connectionId: id }))
    }
  }, [id, dispatch])
  
  const getCommandLogsSlow = () => {
    if (id) {
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.SLOW }))
    }
  }

  const handleKeyClick = (keyName: string) => {
    setSelectedKey(keyName)

    const keyInfo = keys.find((k) => k.name === keyName)
    if (R.isNotEmpty(keyInfo) && !keyInfo!.type) {
      dispatch(getKeyTypeRequested({ connectionId: id!, key: keyName }))
    }
  }

  const selectedKeyInfo = selectedKey
    ? keys.find((k) => k.name === selectedKey)
    : null

  const tabs = [
    { id: "hot-keys" as TabType, label: "Hot Keys" },
    { id: "command-logs" as TabType, label: "Command Logs" },
  ]

  return (
    <div className="flex flex-col h-screen p-4">
      <AppHeader icon={<Activity size={20} />} title="Monitoring" />

      <div className="flex justify-between mr-2">
        {/* Tab Navigation */}
        <div className="">
          <nav className="flex gap-x-1" role="tablist">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  aria-selected={isActive}
                  className={`py-3 px-2 inline-flex items-center gap-x-2 border-b-2 text-sm whitespace-nowrap transition-colors
                            ${isActive
                  ? "border-tw-primary text-tw-primary"
                  : "border-transparent hover:text-tw-primary text-gray-400"
                }
                        `}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  role="tab"
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
        {activeTab === "command-logs" && (
          <button
            className="flex items-center gap-2 font-light"
            onClick={getCommandLogsSlow}
          >
            Refresh <RefreshCcw className="hover:text-tw-primary" size={15} />
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === "hot-keys" ? (
        <div className="flex flex-1 min-h-0">
          {/* Hot Keys List */}
          <div className={selectedKey ? "w-2/3 pr-2" : "w-full"}>
            <div className="h-full border dark:border-tw-dark-border rounded overflow-y-auto">
              <HotKeys
                data={hotKeysData}
                onKeyClick={handleKeyClick}
                selectedKey={selectedKey}
                status={hotKeysStatus}
              />
            </div>
          </div>
          {/* Key Details Panel */}
          {selectedKey && (
            <KeyDetails
              connectionId={id!}
              readOnly={true}
              selectedKey={selectedKey}
              selectedKeyInfo={selectedKeyInfo}
              setSelectedKey={setSelectedKey}
            />
          )}
        </div>
      ) : (
        <div className="flex-1 border dark:border-tw-dark-border rounded overflow-y-auto">
          <SlowLogs data={commandLogsSlowData} />
        </div>
      )}
    </div>

  )
}
