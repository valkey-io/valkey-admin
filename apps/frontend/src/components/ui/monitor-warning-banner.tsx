import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { AlertTriangle, CircleStop, Dot, Minimize2 } from "lucide-react"
import { MONITOR_ACTION, VALKEY } from "@common/src/constants"
import { formatDuration, milliSecondsToSeconds } from "@common/src/time-utils"
import * as R from "ramda"
import { useParams } from "react-router"
import { Button } from "./button"
import { Typography } from "./typography"
import { useAppDispatch } from "@/hooks/hooks"
import { saveMonitorSettingsRequested, selectRunningMonitorConnections } from "@/state/valkey-features/monitor/monitorSlice"

interface MonitoringConfig {
  monitoringDuration: number
  monitoringInterval: number
}

export function MonitorWarningBanner() {
  const { id } = useParams()
  const dispatch = useAppDispatch()
  const config = useSelector((state: unknown) =>
    R.path<{ monitoring?: MonitoringConfig }>([VALKEY.CONFIG.name, id!], state),
  )
  const runningConnections = useSelector(selectRunningMonitorConnections)
  const [expanded, setExpanded] = useState(true)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (runningConnections.length === 0) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [runningConnections.length])

  if (runningConnections.length === 0) return null

  const handleStop = (connectionId: string) => {
    dispatch(saveMonitorSettingsRequested({
      connectionId,
      monitorAction: MONITOR_ACTION.STOP,
    }))
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-auto">
      {expanded ? (
        <div className="border border-destructive rounded-md shadow-xs w-80 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b bg-destructive text-white">
            <div className="flex items-center gap-2 ml-2">
              <AlertTriangle className="shrink-0" size={18} />
              <Typography variant="bodySm">
                MONITOR Active
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

          {/* Connection rows */}
          <div className="flex flex-col gap-2 px-4 py-3 bg-white dark:bg-gray-800">
            <Typography variant="bodyXs">
              Running MONITOR may impact server performance.
            </Typography>
            {runningConnections.map(({ connectionId, startedAt }) => (
              <div className="flex items-center justify-between gap-2" key={connectionId}>
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-xs truncate">{connectionId}</span>
                  {startedAt != null && (
                    <span className="text-xs text-destructive">
                      Running for : {formatDuration(now - startedAt)}
                    </span>
                  )}
                  <span className="text-xs text-gray-400 flex items-center">
                    Duration : {milliSecondsToSeconds(config?.monitoring?.monitoringDuration ?? 10000)} <Dot />
                    Interval : {milliSecondsToSeconds(config?.monitoring?.monitoringInterval ?? 10000)}
                  </span>
                </div>

                <Button

                  onClick={() => handleStop(connectionId)}
                  size="sm"
                  variant="destructive"
                >
                  <CircleStop size={13} />
                  Stop
                </Button>
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
