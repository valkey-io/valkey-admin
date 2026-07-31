import { useEffect, useState, useMemo } from "react"
import { useSelector } from "react-redux"
import { AlertTriangle, Dot, Minimize2, Settings } from "lucide-react"
import { MONITOR_ACTION, VALKEY } from "@common/src/constants"
import { formatDuration, milliSecondsToSeconds } from "@common/src/time-utils"
import * as R from "ramda"
import { Button } from "./button"
import { Typography } from "./typography"
import { HotKeysParamsModal } from "../activity-view/hotkeys/hot-keys-params-modal"
import type { NodeRetryStatus } from "@common/src/node-results.ts"
import type { RootState } from "@/store"
import { useAppDispatch } from "@/hooks/hooks"
import {
  monitorRequested,
  selectRunningMonitorConnections
} from "@/state/valkey-features/monitor/monitorSlice"
import {
  selectConfig,
  selectConfigNodeStatuses,
  type ConfigEntry,
  type NodeStatusEntry
} from "@/state/valkey-features/config/configSlice"
import { selectConnections } from "@/state/valkey-features/connection/connectionSelectors"

// Most node lines the banner lists before collapsing to an overflow total.
const NODE_DISPLAY_LIMIT = 10

interface RunningNode {
  nodeId: string
  startedAt: number | null
}

// Target of the settings modal opened from a banner row.
interface SettingsTarget {
  connectionId: string
  clusterId?: string
}

/** Human text for one node's live status. */
const nodeStatusText = (entry: NodeStatusEntry): string => {
  switch (entry.status) {
    case "attempting":
      return entry.attempt <= 1 ? "updating…" : `attempt ${entry.attempt} of ${entry.maxAttempts}…`
    case "retrying":
      return `retrying (attempt ${entry.attempt} of ${entry.maxAttempts} failed${entry.message ? `: ${entry.message}` : ""})`
    case "failed":
      return `failed after ${entry.maxAttempts} attempt${entry.maxAttempts === 1 ? "" : "s"}${entry.message ? `: ${entry.message}` : ""}`
    case "not_attempted":
      return "not attempted (no registered metrics process)"
    case "succeeded":
      return "updated"
  }
}

const statusColorClass = (status: NodeRetryStatus): string => {
  switch (status) {
    case "failed":
      return "text-destructive"
    case "not_attempted":
      return "text-amber-600"
    case "succeeded":
      return "text-green-600"
    default:
      return "text-gray-400"
  }
}

/**
 * Live per-node config statuses, driven by the server's automatic retry
 * session pushes. Succeeded nodes are collapsed to a count; every other node
 * is listed (up to the display limit) with its current status.
 */
function NodeStatusList({ nodeStatuses }: { nodeStatuses: Record<string, NodeStatusEntry> }) {
  const entries = Object.entries(nodeStatuses)
  const succeeded = entries.filter(([, e]) => e.status === "succeeded")
  const pending = entries.filter(([, e]) => e.status !== "succeeded")
  const shown = pending.slice(0, NODE_DISPLAY_LIMIT)
  const overflow = pending.length - shown.length

  return (
    <div className="flex flex-col mt-1 gap-0.5">
      {shown.map(([nodeId, entry]) => (
        <span className={`font-mono text-xs truncate ${statusColorClass(entry.status)}`} key={nodeId}>
          {nodeId}: {nodeStatusText(entry)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-destructive">+{overflow} more ({pending.length} total)</span>
      )}
      {succeeded.length > 0 && pending.length > 0 && (
        <span className="text-xs text-green-600">{succeeded.length} node{succeeded.length === 1 ? "" : "s"} updated</span>
      )}
    </div>
  )
}

/** True when this entry has anything worth surfacing in the banner. */
const hasConfigIssues = (entry: ConfigEntry | undefined): boolean => {
  if (!entry) return false
  if (entry.status === "failed" || entry.status === "partial" || entry.status === "not_attempted") return true
  if ((entry.notAttemptedNodeIds?.length ?? 0) > 0) return true
  // A live session: any node not yet (or never) succeeded.
  return Object.values(entry.nodeStatuses ?? {}).some((e) => e.status !== "succeeded")
}

interface ClusterRowProps {
  clusterId: string
  runningNodes: RunningNode[]
  now: number
  onOpenSettings: (target: SettingsTarget) => void
}

// One cluster's monitor + config-session state. Per-id selectors are used here
// (rather than in the parent) so they can be hooks within the rendered list.
function ClusterMonitorRow({ clusterId, runningNodes, now, onOpenSettings }: ClusterRowProps) {
  const dispatch = useAppDispatch()
  const nodeStatuses = useSelector(selectConfigNodeStatuses(clusterId))
  const config = useSelector(selectConfig(clusterId))

  const status = config?.status
  const pendingNodes = Object.values(nodeStatuses).filter((e) => e.status !== "succeeded")
  const failedCount = Object.values(nodeStatuses).filter((e) => e.status === "failed").length
  const isPartial = status === "partial" || (failedCount > 0 && (config?.succeededCount ?? 0) > 0)

  const handleStop = () => {
    const nodeId = runningNodes[0]?.nodeId
    if (!nodeId) return
    dispatch(monitorRequested({ connectionId: nodeId, clusterId, monitorAction: MONITOR_ACTION.STOP }))
  }

  const handleOpenSettings = () => {
    const nodeId = runningNodes[0]?.nodeId
    if (!nodeId) return
    onOpenSettings({ connectionId: nodeId, clusterId })
  }

  const startedAt = runningNodes[0]?.startedAt ?? null

  return (
    <div className="flex flex-col border-b last:border-b-0 p-2 mt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs truncate flex-1">{clusterId}</span>
        {runningNodes.length > 0 && (
          <>
            <Button aria-label="Monitor settings" onClick={handleOpenSettings} size="sm" variant="ghost">
              <Settings size={16} />
            </Button>
            <Button onClick={handleStop} size="sm" variant="destructive">
              Stop
            </Button>
          </>
        )}
      </div>

      {startedAt != null && (
        <span className="text-xs text-destructive">
          Running for: {formatDuration(now - startedAt)}
        </span>
      )}

      <span className="text-xs text-gray-400 flex items-center">
        Duration: {milliSecondsToSeconds(config?.monitoring?.monitoringDuration ?? 10000)} <Dot />
        Interval: {milliSecondsToSeconds(config?.monitoring?.monitoringInterval ?? 10000)} <Dot />
        Nodes: {runningNodes.length}
      </span>

      {/* Live per-node config statuses; the server retries failed nodes
          automatically with backoff, this just displays each node's state. */}
      {pendingNodes.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {status === "not_attempted" ? (
            <Typography className="text-amber-600" variant="bodyXs">
              Config update not attempted: no node has a registered metrics process
            </Typography>
          ) : isPartial ? (
            <Typography className="text-destructive" variant="bodyXs">
              Partial failure: {failedCount} failed, {config?.succeededCount ?? 0} succeeded
            </Typography>
          ) : status === "failed" ? (
            <Typography className="text-destructive" variant="bodyXs">
              Config update failed
            </Typography>
          ) : (
            <Typography variant="bodyXs">
              Config update in progress
            </Typography>
          )}
          <NodeStatusList nodeStatuses={nodeStatuses} />
        </div>
      )}
    </div>
  )
}

interface StandaloneRowProps {
  nodeId: string
  startedAt: number | null
  running: boolean
  now: number
  onOpenSettings: (target: SettingsTarget) => void
}

function StandaloneMonitorRow({ nodeId, startedAt, running, now, onOpenSettings }: StandaloneRowProps) {
  const dispatch = useAppDispatch()
  const nodeStatuses = useSelector(selectConfigNodeStatuses(nodeId))
  const config = useSelector(selectConfig(nodeId))

  const pendingNodes = Object.values(nodeStatuses).filter((e) => e.status !== "succeeded")

  const handleStop = () => {
    dispatch(monitorRequested({ connectionId: nodeId, monitorAction: MONITOR_ACTION.STOP }))
  }

  return (
    <div className="border-b p-2 flex flex-col last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs truncate flex-1">{nodeId}</span>
        {running && (
          <>
            <Button
              aria-label="Monitor settings"
              onClick={() => onOpenSettings({ connectionId: nodeId })}
              size="sm"
              variant="ghost"
            >
              <Settings size={16} />
            </Button>
            <Button onClick={handleStop} size="sm" variant="destructive">
              Stop
            </Button>
          </>
        )}
      </div>

      {startedAt != null && (
        <span className="text-xs text-destructive">
          Running for: {formatDuration(now - startedAt)}
        </span>
      )}

      <span className="text-xs text-gray-400 flex items-center">
        Duration: {milliSecondsToSeconds(config?.monitoring?.monitoringDuration ?? 10000)} <Dot />
        Interval: {milliSecondsToSeconds(config?.monitoring?.monitoringInterval ?? 10000)}
      </span>

      {/* Live config status; the server retries automatically with backoff. */}
      {pendingNodes.length > 0 && <NodeStatusList nodeStatuses={nodeStatuses} />}

      {/* Standalone not-attempted outcome: no registered metrics process (Req 5.7) */}
      {config?.status === "not_attempted" && pendingNodes.length === 0 && (
        <Typography className="text-amber-600" variant="bodyXs">
          Not attempted: no registered metrics process
        </Typography>
      )}
    </div>
  )
}

export function MonitorWarningBanner() {
  const runningConnections = useSelector(selectRunningMonitorConnections)
  const connections = useSelector(selectConnections)
  const configState = useSelector((state: RootState) =>
    R.path<Record<string, ConfigEntry>>([VALKEY.CONFIG.name], state) ?? {},
  )
  const [expanded, setExpanded] = useState(true)
  const [now, setNow] = useState(Date.now())
  // Target of the settings modal opened from a row; rendered conditionally so
  // each open remounts the modal and hydrates its fields from the target's
  // current config (a persistent instance would show the previous target's
  // values until its sync effect fires).
  const [settingsTarget, setSettingsTarget] = useState<SettingsTarget | null>(null)

  // Set of known cluster ids, used to classify a config `targetId` as a cluster
  // (key === clusterId) versus a standalone node (key === db-less nodeId).
  const clusterIdSet = useMemo(() => {
    const ids = new Set<string>()
    for (const conn of Object.values(connections)) {
      const clusterId = conn?.connectionDetails?.clusterId
      if (clusterId) ids.add(clusterId)
    }
    return ids
  }, [connections])

  const { clusterRows, standaloneRows } = useMemo(() => {
    // Group running monitors by cluster / standalone (existing behavior).
    const runningClusterNodes: Record<string, RunningNode[]> = {}
    const runningStandalone: Record<string, RunningNode> = {}
    for (const conn of runningConnections) {
      if (conn.clusterId) {
        (runningClusterNodes[conn.clusterId] ??= []).push({ nodeId: conn.nodeId, startedAt: conn.startedAt })
      } else {
        runningStandalone[conn.nodeId] = { nodeId: conn.nodeId, startedAt: conn.startedAt }
      }
    }

    const clusterIds = new Set<string>(Object.keys(runningClusterNodes))
    const standaloneIds = new Set<string>(Object.keys(runningStandalone))

    // Surface targets with an in-flight or unhealthy config session (live
    // retries, failures, not-attempted nodes) even when nothing is running.
    for (const [targetId, entry] of Object.entries(configState)) {
      if (!hasConfigIssues(entry)) continue
      // Classify by the entry's recorded id-arm; fall back to the live
      // connections when an older entry has no kind, so a dropped connection
      // does not misclassify a cluster target as standalone.
      const isCluster = entry?.kind ? entry.kind === "cluster" : clusterIdSet.has(targetId)
      if (isCluster) clusterIds.add(targetId)
      else standaloneIds.add(targetId)
    }

    return {
      clusterRows: [...clusterIds].map((clusterId) => ({
        clusterId,
        runningNodes: runningClusterNodes[clusterId] ?? [],
      })),
      standaloneRows: [...standaloneIds].map((nodeId) => ({
        nodeId,
        running: Boolean(runningStandalone[nodeId]),
        startedAt: runningStandalone[nodeId]?.startedAt ?? null,
      })),
    }
  }, [runningConnections, configState, clusterIdSet])

  const hasContent = clusterRows.length > 0 || standaloneRows.length > 0

  useEffect(() => {
    if (!hasContent) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [hasContent])

  if (!hasContent) return null

  const runningCount = runningConnections.length

  return (
    // z-20 keeps the banner above page content but below modal overlays
    // (z-30/z-40), so an open dialog dims it instead of it floating on top.
    <div className="fixed bottom-16 right-2 z-20 pointer-events-auto animate-in fade-in duration-300">
      {settingsTarget && (
        <HotKeysParamsModal
          clusterId={settingsTarget.clusterId}
          connectionId={settingsTarget.connectionId}
          onClose={() => setSettingsTarget(null)}
          open
        />
      )}
      {expanded ? (
        <div className="border border-destructive rounded-md shadow-xs w-84 max-h-58 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-destructive text-white">
            <div className="flex items-center gap-2 ml-2">
              <AlertTriangle className="shrink-0" size={18} />
              <Typography variant="bodySm">
                {runningCount > 0 ? "MONITOR Active" : "Monitor Status"}
                {runningCount > 0 && <span className="text-white">{" "}({runningCount})</span>}
              </Typography>
            </div>
            <Button
              onClick={() => setExpanded(false)}
              size={"sm"}
              variant={"ghost"}
            >
              <Minimize2 size={16} />
            </Button>
          </div>

          <div className="flex-1 flex flex-col p-2 bg-white dark:bg-gray-800 overflow-y-auto min-h-0">
            {runningCount > 0 && (
              <Typography variant="bodyXs">
                Running MONITOR may impact server performance.
              </Typography>
            )}

            {clusterRows.map(({ clusterId, runningNodes }) => (
              <ClusterMonitorRow
                clusterId={clusterId}
                key={clusterId}
                now={now}
                onOpenSettings={setSettingsTarget}
                runningNodes={runningNodes}
              />
            ))}

            {standaloneRows.map(({ nodeId, running, startedAt }) => (
              <StandaloneMonitorRow
                key={nodeId}
                nodeId={nodeId}
                now={now}
                onOpenSettings={setSettingsTarget}
                running={running}
                startedAt={startedAt}
              />
            ))}
          </div>
        </div>
      ) : (
        <Button
          className="w-10 h-10 bg-destructive hover:bg-destructive/70 text-white rounded-full shadow-xl animate-pulse"
          onClick={() => setExpanded(true)}
        >
          <AlertTriangle size={20} />
        </Button>
      )}
    </div>
  )
}
