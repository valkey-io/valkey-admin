import { useState } from "react"
import { Copy, Flame, AlertCircle } from "lucide-react"
import * as R from "ramda"
import { toast } from "sonner"
import { convertTTL } from "@common/src/ttl-conversion"
import { formatBytes } from "@common/src/bytes-conversion"
import { LoadingState } from "../ui/loading-state"
import { EmptyState } from "../ui/empty-state"
import { TableContainer } from "../ui/table-container"
import { SortableTableHeader, StaticTableHeader, type SortOrder } from "../ui/sortable-table-header"
import { Typography } from "../ui/typography"
import { copyToClipboard } from "@/lib/utils"

interface HotKeysProps {
  data: [string, number, number | null, number, string?][] | null
  errorMessage: string | null
  status?: string
  monitorRunning?: boolean
  nodeErrors?: { connectionId: string; error: string }[]
  lastCollectedAt?: number | null
  onKeyClick?: (keyName: string) => void
  onStartMonitoring?: () => void
  selectedKey?: string | null
}

export function HotKeys({ 
  data, errorMessage, status, monitorRunning, nodeErrors, lastCollectedAt, onKeyClick, onStartMonitoring, selectedKey, 
}: HotKeysProps) {
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")

  const toggleSortOrder = () => {
    setSortOrder((prev) => prev === "asc" ? "desc" : "asc")
  }

  const handleCopyKey = (keyName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(keyName)
    toast.success("Key name copied!")
  }

  const sortedHotKeys = R.sort<[string, number, number | null, number]>(
    (sortOrder === "asc" ? R.ascend : R.descend)(R.nth(1) as (tuple: [string, number, number | null, number,]) => number),
    R.defaultTo([], data),
  )

  if (status === "Pending") {
    return <LoadingState message="Loading hot keys..." />
  }

  const nodeErrorsBanner = nodeErrors && nodeErrors.length > 0 && (
    <div className="m-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-md border
      border-yellow-200 dark:border-yellow-700 flex items-start gap-2">
      <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
      <div>
        <Typography variant="bodySm">
          Hot keys data is partial:
        </Typography>
        <ul className="mt-1 space-y-0.5">
          {nodeErrors.map(({ connectionId, error }) => (
            <li key={connectionId}>
              <Typography variant="bodySm">
                <span className="font-mono">{connectionId}</span>: {error}
              </Typography>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )

  const monitorNotRunningBanner = !monitorRunning && onStartMonitoring && (
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
          Start Monitoring
        </button>
      </Typography>
    </div>
  )

  return sortedHotKeys.length > 0 ? (
    <>
      {nodeErrorsBanner}
      {monitorNotRunningBanner}
      {lastCollectedAt && (
        <div className="px-4 py-2 text-right">
          <Typography className="text-muted-foreground" variant="bodySm">
            Hot Keys last collected at: {new Date(lastCollectedAt).toLocaleString()}
          </Typography>
        </div>
      )}
      <TableContainer
        header={
          <>
            <StaticTableHeader
              icon={<Flame className="text-primary" size={16} />}
              label="Key Name"
              width="w-1/3"
            />
            <SortableTableHeader
              active={true}
              className="text-center"
              label="Access Count"
              onClick={toggleSortOrder}
              sortOrder={sortOrder}
              width="w-1/6"
            />
            <StaticTableHeader className="text-center" label="Size" width="w-1/6" />
            <StaticTableHeader className="text-center" label="TTL" width="w-1/6" />
            <StaticTableHeader className="text-center" label="Node" width="w-1/6" />
          </>
        }
      >
        {sortedHotKeys.map(([keyName, count, size, ttl, nodeId], index) => {
          const isDeleted = ttl === -2
          return (
            <tr
              className={`group border-b dark:border-tw-dark-border transition-all duration-200 cursor-pointer
                        ${isDeleted
              ? "opacity-75"
              : selectedKey === keyName
                ? "bg-primary/10 hover:bg-primary/10"
                : "hover:bg-gray-50 dark:hover:bg-neutral-800/50"
            }`}
              key={`${keyName}-${index}`}
              onClick={() => onKeyClick?.(keyName)}
            >
              {/* key name */}
              <td className="px-4 py-3 w-1/3">
                <div className="flex items-center gap-2">
                  <Typography className={`truncate
                            ${isDeleted
              ? "line-through opacity-75" : ""
            }`} variant={"code"}>
                    {keyName}
                  </Typography>
                  {isDeleted && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full
                             bg-red-200 dark:bg-red-400">
                      <AlertCircle size={12} />
                      DELETED
                    </span>
                  )}
                  {!isDeleted && (
                    <button
                      aria-label = "Copy key name"
                      className="p-1 rounded text-primary hover:bg-primary/20"
                      onClick={(e) => handleCopyKey(keyName, e)}
                    >
                      <Copy size={14} />
                    </button>
                  )}
                </div>
              </td>

              {/* access count */}
              <td className="px-4 py-3 w-1/6 text-center">
                <Typography variant={"bodySm"}>
                  {count.toLocaleString()}
                </Typography>
              </td>

              {/* size */}
              <td className="px-4 py-3 w-1/6 text-center">
                <Typography variant={"bodySm"}>
                  {isDeleted ? "—" : formatBytes(size!)}
                </Typography>
              </td>

              {/* ttl */}
              <td className="px-4 py-3 w-1/6 text-center">
                <Typography variant={"bodySm"}>
                  {isDeleted ? "—" : convertTTL(ttl)}
                </Typography>
              </td>

              {/* node */}
              <td className="px-4 py-3 w-1/6 text-center">
                <Typography variant={"code"}>{nodeId ?? "—"}</Typography>
              </td>
            </tr>
          )
        })}
      </TableContainer>
    </>
  ) : (
    <>
      {nodeErrorsBanner}
      {monitorNotRunningBanner}
      <EmptyState
        action={
          (errorMessage || !monitorRunning) && (
            <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-md flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <Typography variant="bodySm">
                {!monitorRunning && onStartMonitoring ? (
                  <>
                    Monitor is not running.{" "}
                    <button
                      className="text-primary underline hover:opacity-80"
                      onClick={onStartMonitoring}
                      type="button"
                    >
                      Start Monitoring
                    </button>
                  </>
                ) : (
                  errorMessage
                )}
              </Typography>
            </div>
          )
        }
        icon={<Flame size={48} />}
        title="No Hot Keys Found"
      />
    </>
  )
}
