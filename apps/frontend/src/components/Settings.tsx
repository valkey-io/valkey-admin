import { Cog, Save, AlertTriangle, CircleQuestionMark } from "lucide-react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { useEffect, useState } from "react"
import { TooltipProvider } from "@radix-ui/react-tooltip"
import ThemeToggle from "./ui/theme-toggle"
import { CustomTooltip } from "./ui/custom-tooltip"
import { selectConfig, updateConfig } from "@/state/valkey-features/config/configSlice"
import { useAppDispatch } from "@/hooks/hooks"

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
  }, [config?.monitoring, config?.monitoring?.monitorEnabled, config?.monitoring?.monitorDuration])

  const hasChanges =
    config?.monitoring &&
    (monitorEnabled !== config.monitoring.monitorEnabled ||
      monitorDuration !== config.monitoring.monitorDuration)

  const handleSave = () => {
    dispatch(updateConfig({ connectionId: id!, clusterId, config: { monitoring: { monitorEnabled, monitorDuration } } }))
  }
  return (
    <div className="p-4 relative min-h-screen flex flex-col">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <h1 className="text-xl font-bold flex items-center gap-2 text-gray-700 dark:text-white">
          <Cog /> Settings
        </h1>
      </div>
      <div className="mt-10 pl-1">
        <h2 className="border-b-1 pb-1 dark:border-tw-dark-border font-medium text-tw-primary">Appearance</h2>
        <ThemeToggle />
      </div>
      {/* monitoring - only show when connected */}
      {config && (
        <div className="mt-10 pl-1">
          <TooltipProvider>
            <div className="flex items-center gap-2 border-b-1 pb-1 dark:border-tw-dark-border font-medium text-tw-primary">
              <h2>Hot Keys</h2>
              <CustomTooltip description="Enables monitoring to collect hotkeys. Requires key eviction policy not
               set to LFU* and cluster slot stats to be enabled.">
                <CircleQuestionMark className="bg-tw-primary/10 rounded-full text-tw-primary" size={16} />
              </CustomTooltip>
            </div>
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">Enable Monitoring</span>
                <CustomTooltip description="Enable or disable monitoring for this connection.">
                  <CircleQuestionMark className="bg-tw-primary/10 rounded-full text-tw-primary" size={16} />
                </CustomTooltip>
              </div>
              <div className="inline-flex rounded border border-gray-400 overflow-hidden text-sm font-medium">
                <button
                  className={`flex items-center gap-1 px-3 py-1 transition-colors ${monitorEnabled
                    ? "bg-tw-primary text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100 dark:bg-tw-dark-primary dark:text-white dark:hover:bg-gray-700"
                  }`}
                  onClick={() => setMonitorEnabled(true)}
                  type="button"
                >
                  On
                </button>
                <button
                  className={`flex items-center gap-1 px-3 py-1 transition-colors ${!monitorEnabled
                    ? "bg-tw-primary text-white"
                    : "bg-white text-gray-700 hover:bg-gray-100 dark:bg-tw-dark-primary dark:text-white dark:hover:bg-gray-700"
                  }`}
                  onClick={() => setMonitorEnabled(false)}
                  type="button"
                >
                  Off
                </button>
              </div>
            </div>

            {monitorEnabled && (
              <div className="mt-3 flex items-center gap-2 p-2 bg-tw-primary/20 border border-tw-primary/50 rounded">
                <AlertTriangle className="text-amber-600 flex-shrink-0" size={18} />
                <span className="text-tw-primary text-sm">
                  Running  <span className="font-mono">MONITOR</span>  can reduce the throughput by more than 50%.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">Monitor Duration (ms)</span>
                <CustomTooltip description="Duration in milliseconds during which monitoring data is collected.">
                  <CircleQuestionMark className="bg-tw-primary/10 rounded-full text-tw-primary" size={16} />
                </CustomTooltip>
              </div>
              <input
                className="w-32 px-3 py-1 text-sm border border-gray-400 rounded bg-white dark:bg-tw-dark-primary text-gray-700
                 dark:text-white focus:outline-none focus:ring-2 focus:ring-tw-primary"
                min="1000"
                onChange={(e) => setMonitorDuration(Number(e.target.value))}
                step="1000"
                type="number"
                value={monitorDuration}
              />
            </div>

            {/* save button */}
            <div className="flex justify-end mt-6">
              <button
                className="bg-tw-primary flex items-center gap-1 px-3 py-1 rounded cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors
                hover:bg-tw-primary/70 text-sm"
                disabled={!hasChanges}
                onClick={handleSave}
                type="button"
              >
                <Save size={16} />
                Save
              </button>
            </div>
          </TooltipProvider>
        </div>
      )}
    </div>
  )
}

