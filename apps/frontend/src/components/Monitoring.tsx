import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { Activity, RefreshCcw } from "lucide-react"
import { useParams } from "react-router"
import { COMMANDLOG_TYPE } from "@common/src/constants"
import * as R from "ramda"
import { AppHeader } from "./ui/app-header"
import { HotKeys } from "./ui/hot-keys"
import { CommandLogTable } from "./ui/command-log-table"
import KeyDetails from "./ui/key-details"
import type { RootState } from "@/store"
import { commandLogsRequested, selectCommandLogs } from "@/state/valkey-features/commandlogs/commandLogsSlice"
import { useAppDispatch } from "@/hooks/hooks"
import { hotKeysRequested, selectHotKeys, selectHotKeysStatus } from "@/state/valkey-features/hotkeys/hotKeysSlice"
import { getKeyTypeRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { selectKeys } from "@/state/valkey-features/keys/keyBrowserSelectors"

type TabType = "hot-keys" | "command-logs"
type CommandLogSubTab = "slow" | "large-request" | "large-reply"

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
  const { id, clusterId } = useParams()
  const [activeTab, setActiveTab] = useState<TabType>("hot-keys")
  const [commandLogSubTab, setCommandLogSubTab] = useState<CommandLogSubTab>("slow")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  const commandLogsSlowData = useSelector((state: RootState) => selectCommandLogs(id!, COMMANDLOG_TYPE.SLOW)(state))
  const commandLogsLargeRequestData = useSelector((state: RootState) => selectCommandLogs(id!, COMMANDLOG_TYPE.LARGE_REQUEST)(state))
  const commandLogsLargeReplyData = useSelector((state: RootState) => selectCommandLogs(id!, COMMANDLOG_TYPE.LARGE_REPLY)(state))
  const hotKeysData = useSelector((state: RootState) => selectHotKeys(id!)(state))
  console.log("Hot keys data: ", hotKeysData)
  const hotKeysStatus = useSelector((state: RootState) => selectHotKeysStatus(id!)(state))
  const keys: KeyInfo[] = useSelector(selectKeys(id!))

  useEffect(() => {
    if (id) {
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.SLOW }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REQUEST }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REPLY }))
      dispatch(hotKeysRequested({ connectionId: id, clusterId }))
    }
  }, [id, clusterId, dispatch])

  const refreshCommandLogs = () => {
    if (id) {
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.SLOW }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REQUEST }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REPLY }))
    }
  }

  const getCurrentCommandLogData = () => {
    switch (commandLogSubTab) {
      case "slow":
        return commandLogsSlowData
      case "large-request":
        return commandLogsLargeRequestData
      case "large-reply":
        return commandLogsLargeReplyData
      default:
        return commandLogsSlowData
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

  const commandLogSubTabs = [
    { id: "slow" as CommandLogSubTab, label: "Slow Logs" },
    { id: "large-request" as CommandLogSubTab, label: "Large Requests" },
    { id: "large-reply" as CommandLogSubTab, label: "Large Replies" },
  ]

  return (
    <div className="flex flex-col h-screen p-4">
      <AppHeader icon={<Activity size={20} />} title="Monitoring" />

      <div className="flex justify-between mr-2">
        {/* Tab Navigation */}
        <div className="">
          <nav className="flex gap-x-1">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  className={`py-3 px-2 inline-flex items-center gap-x-2 border-b-2 text-sm whitespace-nowrap transition-colors
                            ${isActive
                  ? "border-tw-primary text-tw-primary"
                  : "border-transparent hover:text-tw-primary text-gray-400"
                }
                        `}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Command Log Sub-tabs and Refresh */}
        {activeTab === "command-logs" && (
          <div className="flex items-center gap-3">
            {/* Sub-tabs */}
            <nav className="flex gap-x-1">
              {commandLogSubTabs.map((subTab) => {
                const isActive = commandLogSubTab === subTab.id
                return (
                  <button
                    className={`py-1.5 px-3 text-xs whitespace-nowrap transition-colors rounded-full
                              ${isActive
                    ? "bg-tw-primary text-white"
                    : "bg-gray-200 dark:bg-gray-700 hover:bg-tw-primary/40"
                  }
                          `}
                    key={subTab.id}
                    onClick={() => setCommandLogSubTab(subTab.id)}
                    role="tab"
                  >
                    {subTab.label}
                  </button>
                )
              })}
            </nav>

            {/* Refresh Button */}
            <button
              className="flex items-center gap-2 font-light text-sm"
              onClick={refreshCommandLogs}
            >
              Refresh <RefreshCcw className="hover:text-tw-primary" size={15} />
            </button>
          </div>
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
          <CommandLogTable data={getCurrentCommandLogData()} logType={commandLogSubTab} />
        </div>
      )}
    </div>

  )
}
