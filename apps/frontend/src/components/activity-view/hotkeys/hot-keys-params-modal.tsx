import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { AlertTriangle } from "lucide-react"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { MONITOR_ACTION } from "@common/src/constants"
import { ChartModal } from "../../ui/chart-modal"
import { Button } from "../../ui/button"
import { Input } from "../../ui/input"
import { Typography } from "../../ui/typography"
import { TooltipIcon } from "../../ui/tooltip-icon"
import { useAppDispatch } from "@/hooks/hooks"
import { selectConfig } from "@/state/valkey-features/config/configSlice"
import { saveMonitorSettingsRequested, selectMonitorRunning } from "@/state/valkey-features/monitor/monitorSlice"

interface HotKeysConfigModalProps {
  open: boolean
  onClose: () => void
}

export function HotKeysParamsModal({ open, onClose }: HotKeysConfigModalProps) {
  const { id, clusterId } = useParams()
  const dispatch = useAppDispatch()
  const config = useSelector(selectConfig(id!))
  const monitorRunning = useSelector(selectMonitorRunning(id!))

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
  }, [config?.monitoring?.monitoringDuration, config?.monitoring?.monitoringInterval, config?.monitoring?.maxCommandsPerRun, config?.monitoring?.cutoffFrequency])

  const hasConfigChanges =
    config?.monitoring &&
    (monitorDuration !== config.monitoring.monitoringDuration ||
      monitorInterval !== config.monitoring.monitoringInterval ||
      maxCommandsPerRun !== config.monitoring.maxCommandsPerRun ||
      cutoffFrequency !== config.monitoring.cutoffFrequency)

  const handleStart = () => {
    const configPayload = hasConfigChanges
      ? { epic: { name: "monitor", monitoringDuration: monitorDuration, monitoringInterval: monitorInterval, maxCommandsPerRun, cutoffFrequency } }
      : undefined

    dispatch(saveMonitorSettingsRequested({
      connectionId: id!,
      clusterId,
      config: configPayload,
      monitorAction: MONITOR_ACTION.START,
    }))
    onClose()
  }

  const handleCancel = () => {
    if (monitorRunning) {
      dispatch(saveMonitorSettingsRequested({
        connectionId: id!,
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
      title="Start Monitoring"
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
              <TooltipIcon description="Maximum number of commands captured during each monitoring cycle. Higher values capture more data but use more memory." size={16} />
            </div>
            <Input
              aria-label="Max Commands Per Run"
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
              <TooltipIcon description="Minimum number of times a key must be accessed during a monitoring cycle to be considered hot. Keys accessed fewer times are filtered out." size={16} />
            </div>
            <Input
              aria-label="Cutoff Frequency"
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
              {monitorRunning ? "Started" : "Start"}
            </Button>
          </div>
        </div>
      </TooltipProvider>
    </ChartModal>
  )
}
