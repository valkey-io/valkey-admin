import { Cog, Save, AlertTriangle } from "lucide-react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { useEffect, useState } from "react"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import { MONITOR_ACTION } from "@common/src/constants"
import ThemeToggle from "../ui/theme-toggle"
import { ButtonGroup } from "../ui/button-group"
import RouteContainer from "../ui/route-container"
import { TooltipIcon } from "../ui/tooltip-icon"
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import { Typography } from "../ui/typography"
import { useAppDispatch } from "@/hooks/hooks"
import { selectConfig } from "@/state/valkey-features/config/configSlice"
import { monitorRequested, saveMonitorSettingsRequested, selectMonitorRunning } from "@/state/valkey-features/monitor/monitorSlice"

export default function Settings() {
  const { id, clusterId } = useParams()
  const config = useSelector(selectConfig(id!))
  console.debug(config)
  const dispatch = useAppDispatch()

  const monitorRunning = useSelector(selectMonitorRunning(id!))
  const [localMonitorEnabled, setLocalMonitorEnabled] = useState(monitorRunning)
  const [monitorDuration, setMonitorDuration] = useState(config?.monitoring?.monitoringDuration ?? 10000)
  const [monitorInterval, setMonitorInterval] = useState(config?.monitoring?.monitoringInterval ?? 10000)
  useEffect(() => {
    dispatch(monitorRequested({ connectionId: id!, clusterId, monitorAction: MONITOR_ACTION.STATUS }))
  }, [dispatch, id, clusterId])

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
  }
  return (
    <RouteContainer className="p-4 relative min-h-screen flex flex-col">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <Typography className="flex items-center gap-2" variant="heading">
          <Cog size={20}/> Settings
        </Typography>
      </div>
      <div className="mt-4 pl-1 flex flex-col gap-3">
        <Typography className="border-b pb-1" variant={"label"}>Appearance</Typography>
        <ThemeToggle />
      </div>
      {/* monitoring - only show when connected */}
      {config && (
        <div className="mt-10 pl-1">
          <TooltipProvider>
            <Typography className="flex items-center gap-2 border-b pb-1" variant="label">
              Hot Keys
              <TooltipIcon
                description={
                  "Alternative method that enables monitoring to collect hotkeys. " +
                  "Use if you cannot change your eviction policy to LFU* and if you cannot enable cluster slot stats."
                }
                size={16}
              ></TooltipIcon>
            </Typography>
            <div className="flex  items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <Typography variant="bodySm">Enable Monitoring</Typography>
                <TooltipIcon description="Enable or disable monitoring for this connection." size={16}>
                </TooltipIcon>
              </div>
              <ButtonGroup
                onChange={(value) => setLocalMonitorEnabled(value === "on")}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
                value={localMonitorEnabled ? "on" : "off"}
              />
            </div>

            {localMonitorEnabled && (
              <div className="mt-3 flex items-center gap-2 p-2 bg-primary/20 border border-primary/50 rounded">
                <AlertTriangle className="text-amber-600 shrink-0" size={18} />
                <Typography variant="bodySm">
                  Running{" "}
                  <Typography variant="code">MONITOR</Typography>{" "}
                  Monitoring can impact performance. We recommend testing with your workload
                  before production use.
                </Typography>
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <Typography variant="bodySm">Monitor Duration (ms)</Typography>
                <TooltipIcon description="Duration in milliseconds during which monitoring data is collected." size={16}>
                </TooltipIcon>
              </div>
              <Input
                aria-label = "Monitor Duration"
                onChange={(e) => setMonitorDuration(Number(e.target.value))}
                step="1000"
                style={{ width: "100px" }}
                type="number"
                value={monitorDuration}
              />
            </div>

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <Typography variant="bodySm">Monitor Interval (ms)</Typography>
                <TooltipIcon description="Delay in milliseconds between consecutive monitoring cycles." size={16}>
                </TooltipIcon>
              </div>
              <Input
                aria-label = "Monitor Interval"
                onChange={(e) => setMonitorInterval(Number(e.target.value))}
                step="1000"
                style={{ width: "100px" }}
                type="number"
                value={monitorInterval}
              />
            </div>

            {/* save button */}
            <div className="flex justify-end mt-6">
              <Button
                disabled={!hasConfigChanges && !hasMonitorToggleChanged}
                onClick={handleSave}
                size={"sm"}
                type="button"
                variant={"default"}
              >
                <Save size={16} />
                Save
              </Button>
            </div>
          </TooltipProvider>
        </div>
      )}
    </RouteContainer>
  )
}

