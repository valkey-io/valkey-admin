import { useState } from "react"
import { AlertCircle, ChevronDown, ChevronUp } from "lucide-react"
import { Alert, AlertDescription } from "../../ui/alert"
import { Typography } from "../../ui/typography"

interface NodeErrorsBannerProps {
  nodeErrors: { connectionId: string; error: string }[]
}

export function NodeErrorsBanner({ nodeErrors }: NodeErrorsBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (nodeErrors.length === 0) return null

  return (
    <div className="m-3 relative">
      <Alert
        className="cursor-pointer"
        onClick={() => setExpanded((prev) => !prev)}
        variant="warning"
      >
        <AlertDescription className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Hot keys data is partial — {nodeErrors.length} node{nodeErrors.length > 1 ? "s " : " "}
          failed to respond or {nodeErrors.length > 1 ? "are" : "is"} not connected
          {expanded
            ? <ChevronUp className="w-4 h-4 shrink-0 ml-auto" />
            : <ChevronDown className="w-4 h-4 shrink-0 ml-auto" />
          }
        </AlertDescription>
      </Alert>
      {expanded && (
        <ul className="absolute z-50 left-0 right-0 mt-0.5 p-3 max-h-40 overflow-y-auto space-y-0.5
           rounded-md border bg-accent shadow-sm">
          {nodeErrors.map(({ connectionId, error }) => (
            <li key={connectionId}>
              <Typography variant="bodySm">
                <span className="font-mono">{connectionId}</span>: {error}
              </Typography>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface MonitorNotRunningBannerProps {
  onStartMonitoring: () => void
}

export function MonitorNotRunningBanner({ onStartMonitoring }: MonitorNotRunningBannerProps) {
  return (
    <div className="m-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-md border
      border-red-200 dark:border-red-700 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
      <Typography variant="bodySm">
        Monitor is not running. Showing last known data.{" "}
        <button
          className="text-primary underline hover:opacity-80"
          onClick={onStartMonitoring}
          type="button"
        >
          Start MONITOR
        </button>
      </Typography>
    </div>
  )
}
