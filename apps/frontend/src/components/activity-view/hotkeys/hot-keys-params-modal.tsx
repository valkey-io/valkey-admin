import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { AlertTriangle } from "lucide-react"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { MONITOR_ACTION } from "@common/src/constants"
import { toNodeId } from "@common/src/connection-id.ts"
import { ChartModal } from "../../ui/chart-modal"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Typography } from "../../ui/typography"
import { TooltipIcon } from "../../ui/tooltip-icon"
import type { RootState } from "@/store"
import { useAppDispatch } from "@/hooks/hooks"
import { selectConfig } from "@/state/valkey-features/config/configSlice"
import { monitorRequested, selectMonitorRunning, selectClusterMonitorRunning } from "@/state/valkey-features/monitor/monitorSlice"
import { updateConfig } from "@/state/valkey-features/config/configSlice"

interface HotKeysConfigModalProps {
  open: boolean
  onClose: () => void
  // Connection identifier of the target (db-less nodeId also accepted:
  // `toNodeId` is idempotent and the server ignores it for clusters), so the
  // modal can be opened from outside the routed activity view (e.g. the
  // monitor warning banner).
  connectionId: string
  clusterId?: string
}

export function HotKeysParamsModal({ open, onClose, connectionId, clusterId }: HotKeysConfigModalProps) {
  const dispatch = useAppDispatch()
  // Config and monitor state are cluster-keyed for clusters, node-keyed otherwise.
  const config = useSelector(selectConfig(clusterId ?? toNodeId(connectionId)))
  const monitorRunning = useSelector((state: RootState) =>
    clusterId ? selectClusterMonitorRunning(clusterId)(state) : selectMonitorRunning(toNodeId(connectionId))(state),
  )

  const [monitorDuration, setMonitorDuration] = useState(config?.monitoring?.monitoringDuration ?? 10000)
  const [monitorInterval, setMonitorInterval] = useState(config?.monitoring?.monitoringInterval ?? 10000)
  const [maxCommandsPerRun, setMaxCommandsPerRun] = useState(config?.monitoring?.maxCommandsPerRun ?? 1000000)
  const [cutoffFrequency, setCutoffFrequency] = useState(config?.monitoring?.cutoffFrequency ?? 100)

  useEffect(() => {
    if (config?.monitoring) {
      setMonitorDuration(config.monitoring.monitoringDuration)
      setMonitorInterval(config.monitoring.monitoringInterval)
      setMaxCommandsPerRun(config.monitoring.maxCommandsPerRun)
      setCutoffFrequency(config.monitoring.cutoffFrequency)
    }
  }, [config?.monitoring])

  const hasConfigChanges =
    config?.monitoring &&
    (monitorDuration !== config.monitoring.monitoringDuration ||
      monitorInterval !== config.monitoring.monitoringInterval ||
      maxCommandsPerRun !== config.monitoring.maxCommandsPerRun ||
      cutoffFrequency !== config.monitoring.cutoffFrequency)

  const handleStart = () => {
    if (hasConfigChanges) {
      // Config changed: push it (with server-side retry) and start MONITOR on
      // the config-succeeded nodes once the session resolves. On an
      // already-running monitor the metrics process restarts it with the new
      // settings, and the start rider is an idempotent no-op.
      dispatch(updateConfig({
        connectionId,
        clusterId,
        config: {
          epic: {
            name: "monitor", monitoringDuration: monitorDuration,
            monitoringInterval: monitorInterval, maxCommandsPerRun, cutoffFrequency,
          },
        },
        monitorAction: MONITOR_ACTION.START,
      }))
    } else {
      // No config change: a pure toggle needs no config session.
      dispatch(monitorRequested({
        connectionId,
        clusterId,
        monitorAction: MONITOR_ACTION.START,
      }))
    }
    onClose()
  }

  const handleCancel = () => {
    if (monitorRunning) {
      dispatch(monitorRequested({
        connectionId,
        clusterId,
        monitorAction: MONITOR_ACTION.STOP,
      }))
    }
    onClose()
  }

  return (
    <ChartModal
      onClose={onClose}
      open={open}
      subtitle="Alternative method based on MONITOR command that enables capturing Hot Keys"
      title="Monitoring"
    >
      <TooltipProvider>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 p-2 bg-primary/20 border border-primary/50 rounded">
            <AlertTriangle className="text-amber-600 shrink-0" size={18} />
            <Typography variant="bodySm">
              Running{" "}
              <Typography variant="code">MONITOR</Typography>{" "}
              can impact performance. We recommend testing with your workload before production use.
            </Typography>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Typography variant="bodySm">Monitor Duration (ms)</Typography>
              <TooltipIcon description="Duration in milliseconds during which monitoring data is collected." size={16} />
            </div>
            <Input
              aria-label="Monitor Duration"
              min="1"
              onChange={(e) => setMonitorDuration(Number(e.target.value))}
              step="1000"
              style={{ width: "100px" }}
              type="number"
              value={monitorDuration}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Typography variant="bodySm">Monitor Interval (ms)</Typography>
              <TooltipIcon description="Delay in milliseconds between consecutive monitoring cycles." size={16} />
            </div>
            <Input
              aria-label="Monitor Interval"
              min="1"
              onChange={(e) => setMonitorInterval(Number(e.target.value))}
              step="1000"
              style={{ width: "100px" }}
              type="number"
              value={monitorInterval}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Typography variant="bodySm">Max Commands Per Run</Typography>
              <TooltipIcon
                description={"Maximum number of commands captured during each monitoring cycle."
                  + " Higher values capture more data but use more memory."}
                size={16}
              />
            </div>
            <Input
              aria-label="Max Commands Per Run"
              min="1"
              onChange={(e) => setMaxCommandsPerRun(Number(e.target.value))}
              step="100000"
              style={{ width: "140px" }}
              type="number"
              value={maxCommandsPerRun}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Typography variant="bodySm">Cutoff Frequency</Typography>
              <TooltipIcon
                description={"Minimum number of times a key must be accessed during a monitoring cycle"
                  + " to be considered hot. Keys accessed fewer times are filtered out."}
                size={16}
              />
            </div>
            <Input
              aria-label="Cutoff Frequency"
              min="1"
              onChange={(e) => setCutoffFrequency(Number(e.target.value))}
              step="10"
              style={{ width: "100px" }}
              type="number"
              value={cutoffFrequency}
            />
          </div>

          <div className="flex justify-end mt-2 gap-2">
            <Button
              disabled={!monitorRunning && !hasConfigChanges}
              onClick={handleCancel}
              size="sm"
              type="button"
              variant="ghost"
            >
              Stop
            </Button>
            <Button
              disabled={monitorRunning && !hasConfigChanges}
              onClick={handleStart}
              size="sm"
              type="button"
              variant="default"
            >
              {monitorRunning ? (hasConfigChanges ? "Apply & Restart" : "Started") : "Start"}
            </Button>
          </div>
        </div>
      </TooltipProvider>
    </ChartModal>
  )
}
