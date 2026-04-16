import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { Activity, RefreshCcw } from "lucide-react"
import { useParams } from "react-router"
import { COMMANDLOG_TYPE } from "@common/src/constants"
import * as R from "ramda"
import { truncateText } from "@common/src/truncate-text"
import { AppHeader } from "../ui/app-header"
import { TabGroup } from "../ui/tab-group"
import { ButtonGroup } from "../ui/button-group"
import { HotKeys } from "./hot-keys"
import { HotKeysParamsModal } from "./hot-keys-params-modal"
import { CommandLogTable } from "./command-log-table"
import KeyDetails from "../key-browser/key-details/key-details"
import RouteContainer from "../ui/route-container"
import { Button } from "../ui/button"
import type { RootState } from "@/store"
import { commandLogsRequested, selectCommandLogs, selectCommandLogsNodeErrors } from "@/state/valkey-features/commandlogs/commandLogsSlice"
import { useAppDispatch } from "@/hooks/hooks"
import {
  hotKeysRequested, selectHotKeys, selectHotKeysStatus, selectHotKeysError,
  selectHotKeysNodeErrors, selectHotKeysLastCollectedAt
} from "@/state/valkey-features/hotkeys/hotKeysSlice"
import { selectMonitorRunning } from "@/state/valkey-features/monitor/monitorSlice"
import { selectConnectionDetails } from "@/state/valkey-features/connection/connectionSelectors"
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
  const [configOpen, setConfigOpen] = useState(false)

  const commandLogsId = clusterId ?? id!
  const commandLogsSlowData = useSelector((state: RootState) => selectCommandLogs(commandLogsId, COMMANDLOG_TYPE.SLOW)(state))
  const commandLogsLargeRequestData = useSelector((state: RootState) => selectCommandLogs(commandLogsId, COMMANDLOG_TYPE.LARGE_REQUEST)(state))
  const commandLogsLargeReplyData = useSelector((state: RootState) => selectCommandLogs(commandLogsId, COMMANDLOG_TYPE.LARGE_REPLY)(state))
  const commandLogsNodeErrors = useSelector((state: RootState) => selectCommandLogsNodeErrors(commandLogsId)(state))
  const hotKeysId = clusterId ?? id!
  const hotKeysData = useSelector((state: RootState) => selectHotKeys(hotKeysId)(state))
  const hotKeysStatus = useSelector((state: RootState) => selectHotKeysStatus(hotKeysId)(state))
  const hotKeysErrorMessage = useSelector((state: RootState) => selectHotKeysError(hotKeysId)(state))
  const hotKeysNodeErrors = useSelector((state: RootState) => selectHotKeysNodeErrors(hotKeysId)(state))
  const hotKeysLastCollectedAt = useSelector((state: RootState) => selectHotKeysLastCollectedAt(hotKeysId)(state))
  const monitorRunning = useSelector(selectMonitorRunning(id!))
  const connectionDetails = useSelector((state: RootState) => selectConnectionDetails(id!)(state))
  const useHotSlots = connectionDetails?.keyEvictionPolicy?.includes("lfu") && connectionDetails?.clusterSlotStatsEnabled
  const keys: KeyInfo[] = useSelector(selectKeys(id!))

  useEffect(() => {
    if (id) {
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.SLOW, clusterId }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REQUEST, clusterId }))
      dispatch(commandLogsRequested({ connectionId: id, commandLogType: COMMANDLOG_TYPE.LARGE_REPLY, clusterId }))
      dispatch(hotKeysRequested({ connectionId: id, clusterId }))
    }
  }, [id, clusterId, dispatch])

  useEffect(() => {
    if (id) {
      dispatch(hotKeysRequested({ connectionId: id, clusterId }))
    }
  }, [monitorRunning, id, clusterId, dispatch])

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
      <HotKeysParamsModal onClose={() => setConfigOpen(false)} open={configOpen} />
      <AppHeader
        description={
          <>
            Monitor Hot Keys and Command Logs of{" "}
            {clusterId ? (
              <>
                cluster node{" "} <span className="font-semibold text-primary">{truncateText(id!)}</span>
              </>
            ) : (
              <>instance <span className="font-semibold text-primary">{truncateText(id!)}</span></>
            )}
          </>
        }
        icon={<Activity size={20} />}
        title="Monitoring"
      />

      <div className="flex justify-between">
        {/* Tab Navigation */}
        <TabGroup activeTab={activeTab} onChange={setActiveTab} tabs={tabs} />

        {/* Hot Keys Refresh */}
        {activeTab === "hot-keys" && (
          <div className="flex items-center gap-3">
            <Button
              onClick={refreshHotKeys}
              size={"sm"}
              variant={"outline"}
            >
              Refresh <RefreshCcw className="hover:text-primary" size={15} />
            </Button>
          </div>
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
              Refresh <RefreshCcw className="hover:text-primary" size={15} />
            </Button>
          </div>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === "hot-keys" ? (
        <div className="flex flex-1 h-full overflow-hidden gap-2">
          {/* Hot Keys List */}
          <div className={selectedKey ? "w-2/3 h-full" : "w-full h-full"}>
            <div className="flex-1 h-full border border-input rounded-md shadow-xs">
              <HotKeys
                data={hotKeysData}
                errorMessage={hotKeysErrorMessage as string | null}
                lastCollectedAt={hotKeysLastCollectedAt}
                monitorRunning={monitorRunning}
                nodeErrors={hotKeysNodeErrors}
                onKeyClick={handleKeyClick}
                onStartMonitoring={useHotSlots ? undefined : () => setConfigOpen(true)}
                selectedKey={selectedKey}
                status={hotKeysStatus}
              />
            </div>
          </div>
          {/* Key Details Panel */}
          {selectedKey && (
            <div className="w-1/3 h-full">
              <KeyDetails
                connectionId={id!}
                readOnly={true}
                selectedKey={selectedKey}
                selectedKeyInfo={selectedKeyInfo}
                setSelectedKey={setSelectedKey}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 h-full overflow-hidden border border-input rounded-md shadow-xs">
          <CommandLogTable data={getCurrentCommandLogData()} logType={commandLogSubTab} nodeErrors={commandLogsNodeErrors} />
        </div>
      )}
    </RouteContainer>

  )
}
