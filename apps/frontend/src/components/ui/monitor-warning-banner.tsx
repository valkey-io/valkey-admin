import { useEffect, useState, useMemo } from "react"
import { useSelector } from "react-redux"
import { AlertTriangle, Dot, Minimize2 } from "lucide-react"
import { MONITOR_ACTION, VALKEY } from "@common/src/constants"
import { formatDuration, milliSecondsToSeconds } from "@common/src/time-utils"
import * as R from "ramda"
import { Button } from "./button"
import { Typography } from "./typography"
import { useAppDispatch } from "@/hooks/hooks"
import { monitorRequested, selectRunningMonitorConnections } from "@/state/valkey-features/monitor/monitorSlice"
import { selectAllClusters } from "@/state/valkey-features/cluster/clusterSelectors"

interface MonitoringConfig {
  monitoringDuration: number
  monitoringInterval: number
}

export function MonitorWarningBanner() {
  const dispatch = useAppDispatch()
  const runningConnections = useSelector(selectRunningMonitorConnections)
  const clusters = useSelector(selectAllClusters)
  const configState = useSelector((state: unknown) =>
    R.path<Record<string, { monitoring?: MonitoringConfig }>>([VALKEY.CONFIG.name], state) ?? {},
  )
  const [expanded, setExpanded] = useState(true)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (runningConnections.length === 0) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [runningConnections.length])

  const { clusterGroups, standaloneConnections } = useMemo(() => {
    const groups: Record<string, { connectionId: string; startedAt: number | null }[]> = {}
    const standalone: { connectionId: string; startedAt: number | null }[] = []

    for (const [clusterId, cluster] of Object.entries(clusters)) {
      const clusterNodeIds = new Set(Object.keys(cluster.clusterNodes ?? {}))
      const matching = runningConnections.filter((c) => clusterNodeIds.has(c.connectionId))
      if (matching.length > 0) groups[clusterId] = matching
    }

    const grouped = new Set(Object.values(groups).flat().map((c) => c.connectionId))
    for (const conn of runningConnections) {
      if (!grouped.has(conn.connectionId)) standalone.push(conn)
    }

    return { clusterGroups: groups, standaloneConnections: standalone }
  }, [runningConnections, clusters])

  if (runningConnections.length === 0) return null

  const handleStop = (connectionId: string, cId?: string) => {
    dispatch(monitorRequested({
      connectionId,
      clusterId: cId,
      monitorAction: MONITOR_ACTION.STOP,
    }))
  }

  return (
    <div className="fixed bottom-16 right-2 z-50 pointer-events-auto animate-in fade-in duration-300">
      {expanded ? (
        <div className="border border-destructive rounded-md shadow-xs w-84 max-h-58 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-destructive text-white">
            <div className="flex items-center gap-2 ml-2">
              <AlertTriangle className="shrink-0" size={18} />
              <Typography variant="bodySm">MONITOR Active
                <span className="text-white">{" "}({runningConnections.length})</span>
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
            <Typography variant="bodyXs">
              Running MONITOR may impact server performance.
            </Typography>

            {/* Cluster - with its own button */}
            {Object.entries(clusterGroups).map(([cId, nodes]) => (
              <div className="flex flex-col border-b last:border-b-0 p-2 mt-2" key={cId}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs truncate flex-1">{cId}</span>
                  <Button
                    onClick={() => handleStop(nodes[0].connectionId, cId)}
                    size={"sm"}
                    variant={"destructive"}
                  >
                    Stop
                  </Button>
                </div>
                {nodes[0].startedAt != null && (
                  <span className="text-xs text-destructive">
                    Running for: {formatDuration(now - nodes[0].startedAt)}
                  </span>
                )}
                <span className="text-xs text-gray-400 flex items-center">
                  Duration: {milliSecondsToSeconds(configState[nodes[0].connectionId]?.monitoring?.monitoringDuration ?? 10000)} <Dot />
                  Interval: {milliSecondsToSeconds(configState[nodes[0].connectionId]?.monitoring?.monitoringInterval ?? 10000)} <Dot />
                  Nodes: {nodes.length}
                </span>
              </div>
            ))}

            {/* Standalone — with its own button */}
            {standaloneConnections.map(({ connectionId, startedAt }) => (
              <div className="border-b p-2 flex flex-col last:border-b-0" key={connectionId}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs truncate flex-1">{connectionId}</span>
                  <Button
                    onClick={() => handleStop(connectionId)}
                    size={"sm"}
                    variant={"destructive"}
                  >
                    Stop
                  </Button>
                </div>
                {startedAt != null && (
                  <span className="text-xs text-destructive">
                    Running for: {formatDuration(now - startedAt)}
                  </span>
                )}
                <span className="text-xs text-gray-400 flex items-center">
                  Duration: {milliSecondsToSeconds(configState[connectionId]?.monitoring?.monitoringDuration ?? 10000)} <Dot />
                  Interval: {milliSecondsToSeconds(configState[connectionId]?.monitoring?.monitoringInterval ?? 10000)}
                </span>
              </div>
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
