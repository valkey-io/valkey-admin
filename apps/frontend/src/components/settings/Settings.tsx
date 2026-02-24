import { Cog, Save, AlertTriangle } from "lucide-react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { useEffect, useState } from "react"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import ThemeToggle from "../ui/theme-toggle"
import { ButtonGroup } from "../ui/button-group"
import RouteContainer from "../ui/route-container"
import { TooltipIcon } from "../ui/tooltip-icon"
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import { Typography } from "../ui/typography"
import { useAppDispatch } from "@/hooks/hooks"
import { selectConfig, updateConfig } from "@/state/valkey-features/config/configSlice"

export default function Settings() {
  const { id, clusterId } = useParams()
  const config = useSelector(selectConfig(id!))
  console.log(config)
  const dispatch = useAppDispatch()

  const [monitorEnabled, setMonitorEnabled] = useState(config?.monitoring?.monitorEnabled ?? false)
  const [monitorDuration, setMonitorDuration] = useState(config?.monitoring?.monitorDuration ?? 6000)

  useEffect(() => {
    if (config?.monitoring) {
      setMonitorEnabled(config.monitoring.monitorEnabled)
      setMonitorDuration(config.monitoring.monitorDuration)
    }
  }, [config?.monitoring?.monitorEnabled, config?.monitoring?.monitorDuration])

  const hasChanges =
    config?.monitoring &&
    (monitorEnabled !== config.monitoring.monitorEnabled ||
      monitorDuration !== config.monitoring.monitorDuration)

  const handleSave = () => {
    dispatch(updateConfig({ connectionId: id!, clusterId, config: { monitoring: { monitorEnabled, monitorDuration } } }))
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
              <TooltipIcon description="Enables monitoring to collect hotkeys. Requires key eviction policy not
               set to LFU* and cluster slot stats to be enabled." size={16}>
              </TooltipIcon>
            </Typography>
            <div className="flex  items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <Typography variant="bodySm">Enable Monitoring</Typography>
                <TooltipIcon description="Enable or disable monitoring for this connection." size={16}>
                </TooltipIcon>
              </div>
              <ButtonGroup
                onChange={(value) => setMonitorEnabled(value === "on")}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
                value={monitorEnabled ? "on" : "off"}
              />
            </div>

            {monitorEnabled && (
              <div className="mt-3 flex items-center gap-2 p-2 bg-tw-primary/20 border border-tw-primary/50 rounded">
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
                onChange={(e) => setMonitorDuration(Number(e.target.value))}
                step="1000"
                style={{ width: "100px" }}
                type="number"
                value={monitorDuration}
              />
            </div>

            {/* save button */}
            <div className="flex justify-end mt-6">
              <Button
                disabled={!hasChanges}
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

