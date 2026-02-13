import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { Activity, RefreshCcw } from "lucide-react"
import { useParams } from "react-router"
import { COMMANDLOG_TYPE } from "@common/src/constants"
import * as R from "ramda"
import { AppHeader } from "../ui/app-header"
import { TabGroup } from "../ui/tab-group"
import { ButtonGroup } from "../ui/button-group"
import { HotKeys } from "./hot-keys"
import { CommandLogTable } from "./command-log-table"
import KeyDetails from "../key-browser/key-details/key-details"
import RouteContainer from "../ui/route-container"
import { Button } from "../ui/button"
import { Panel } from "../ui/panel"
import type { RootState } from "@/store"
import { commandLogsRequested, selectCommandLogs } from "@/state/valkey-features/commandlogs/commandLogsSlice"
import { useAppDispatch } from "@/hooks/hooks"
import { hotKeysRequested, selectHotKeys, selectHotKeysStatus, selectHotKeysError } from "@/state/valkey-features/hotkeys/hotKeysSlice"
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
  const hotKeysErrorMessage = useSelector((state:RootState) => selectHotKeysError(id!)(state))
  const keys: KeyInfo[] = useSelector(selectKeys(id!))

  useEffect(() => {
    if (id) {
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.SLOW, clusterId }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REQUEST, clusterId }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REPLY, clusterId }))
      dispatch(hotKeysRequested({ connectionId: id, clusterId }))
    }
  }, [id, clusterId, dispatch])

  const refreshCommandLogs = () => {
    if (id) {
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.SLOW, clusterId }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REQUEST, clusterId }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REPLY, clusterId }))
    }
  }

  const refreshHotKeys = () => {
    if (id) {
      dispatch(hotKeysRequested({ connectionId: id, clusterId }))
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
    ? keys.find((k) => k.name === selectedKey) ?? null
    : null

  const tabs = [
    { id: "hot-keys" as TabType, label: "Hot Keys" },
    { id: "command-logs" as TabType, label: "Command Logs" },
  ]

  const commandLogSubTabs = [
    { value: "slow" as CommandLogSubTab, label: "Slow Logs" },
    { value: "large-request" as CommandLogSubTab, label: "Large Requests" },
    { value: "large-reply" as CommandLogSubTab, label: "Large Replies" },
  ]

  return (
    <RouteContainer title="monitoring">
      <AppHeader icon={<Activity size={20} />} title="Monitoring" />

      <div className="flex justify-between">
        {/* Tab Navigation */}
        <TabGroup activeTab={activeTab} onChange={setActiveTab} tabs={tabs} />

        {/* Hot Keys Refresh */}
        {activeTab === "hot-keys" && (
          <Button
            onClick={refreshHotKeys}
            size={"sm"}
            variant={"outline"}
          >
            Refresh <RefreshCcw className="hover:text-tw-primary" size={15} />
          </Button>
        )}

        {/* Command Log Sub-tabs and Refresh */}
        {activeTab === "command-logs" && (
          <div className="flex items-center gap-3">
            <ButtonGroup
              onChange={(value) => setCommandLogSubTab(value as CommandLogSubTab)}
              options={commandLogSubTabs}
              value={commandLogSubTab}
            />

            {/* Refresh Button */}
            <Button
              onClick={refreshCommandLogs}
              size={"sm"}
              variant={"outline"}
            >
              Refresh <RefreshCcw className="hover:text-tw-primary" size={15} />
            </Button>
          </div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === "hot-keys" ? (
        <div className="flex flex-1">
          {/* Hot Keys List */}
          <div className={selectedKey ? "w-2/3 pr-2" : "w-full"}>
            <Panel >
              <HotKeys
                data={hotKeysData}
                errorMessage={hotKeysErrorMessage as string | null}
                onKeyClick={handleKeyClick}
                selectedKey={selectedKey}
                status={hotKeysStatus}
              />
            </Panel>
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
        <Panel>
          <CommandLogTable data={getCurrentCommandLogData()} logType={commandLogSubTab} />
        </Panel>
      )}
    </RouteContainer>

  )
}
