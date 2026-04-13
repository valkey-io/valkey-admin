import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { Save, AlertTriangle } from "lucide-react"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { MONITOR_ACTION } from "@common/src/constants"
import { ChartModal } from "../ui/chart-modal"
import { ButtonGroup } from "../ui/button-group"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Typography } from "../ui/typography"
import { TooltipIcon } from "../ui/tooltip-icon"
import { useAppDispatch } from "@/hooks/hooks"
import { selectConfig } from "@/state/valkey-features/config/configSlice"
import { monitorRequested, saveMonitorSettingsRequested, selectMonitorRunning } from "@/state/valkey-features/monitor/monitorSlice"

interface HotKeysConfigModalProps {
  open: boolean
  onClose: () => void
}

export function HotKeysParamsModal({ open, onClose }: HotKeysConfigModalProps) {
  const { id, clusterId } = useParams()
  const dispatch = useAppDispatch()
  const config = useSelector(selectConfig(id!))
  const monitorRunning = useSelector(selectMonitorRunning(id!))

  const [localMonitorEnabled, setLocalMonitorEnabled] = useState(monitorRunning)
  const [monitorDuration, setMonitorDuration] = useState(config?.monitoring?.monitoringDuration ?? 10000)
  const [monitorInterval, setMonitorInterval] = useState(config?.monitoring?.monitoringInterval ?? 10000)

  useEffect(() => {
    if (open) {
      dispatch(monitorRequested({ connectionId: id!, clusterId, monitorAction: MONITOR_ACTION.STATUS }))
    }
  }, [open, dispatch, id, clusterId])

  useEffect(() => {
    setLocalMonitorEnabled(monitorRunning)
  }, [monitorRunning])

  useEffect(() => {
    if (config?.monitoring) {
      setMonitorDuration(config.monitoring.monitoringDuration)
      setMonitorInterval(config.monitoring.monitoringInterval)
    }
  }, [config?.monitoring?.monitoringDuration, config?.monitoring?.monitoringInterval])

  const hasConfigChanges =
    config?.monitoring &&
    (monitorDuration !== config.monitoring.monitoringDuration ||
      monitorInterval !== config.monitoring.monitoringInterval)

  const hasMonitorToggleChanged = localMonitorEnabled !== monitorRunning

  const handleSave = () => {
    const monitorAction = hasMonitorToggleChanged
      ? (localMonitorEnabled ? MONITOR_ACTION.START : MONITOR_ACTION.STOP)
      : undefined

    const configPayload = hasConfigChanges
      ? { epic: { name: "monitor", monitoringDuration: monitorDuration, monitoringInterval: monitorInterval } }
      : undefined

    dispatch(saveMonitorSettingsRequested({ connectionId: id!, clusterId, config: configPayload, monitorAction }))
    onClose()
  }

  return (
    <ChartModal
      onClose={onClose}
      open={open}
      subtitle="Alternative method that enables monitoring to collect hotkeys. Use if you cannot change your eviction
       policy to LFU* and if you cannot enable cluster slot stats."
      title="Hot Keys Params"
    >
      <TooltipProvider>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Typography variant="bodySm">Start/Stop Monitoring</Typography>
              <TooltipIcon description="Start or stop monitoring for this connection." size={16} />
            </div>
            <ButtonGroup
              onChange={(value) => setLocalMonitorEnabled(value === "on")}
              options={[
                { value: "on", label: "Start" },
                { value: "off", label: "Stop" },
              ]}
              value={localMonitorEnabled ? "on" : "off"}
            />
          </div>

          {localMonitorEnabled && (
            <div className="flex items-center gap-2 p-2 bg-primary/20 border border-primary/50 rounded">
              <AlertTriangle className="text-amber-600 shrink-0" size={18} />
              <Typography variant="bodySm">
                Running{" "}
                <Typography variant="code">MONITOR</Typography>{" "}
                can impact performance. We recommend testing with your workload before production use.
              </Typography>
            </div>
          )}

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

          <div className="flex justify-end mt-2">
            <Button
              disabled={!hasConfigChanges && !hasMonitorToggleChanged}
              onClick={handleSave}
              size="sm"
              type="button"
              variant="default"
            >
              <Save size={16} />
              Save
            </Button>
          </div>
        </div>
      </TooltipProvider>
    </ChartModal>
  )
}
