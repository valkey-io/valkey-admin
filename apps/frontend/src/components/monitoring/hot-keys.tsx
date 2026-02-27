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
  data: [string, number, number | null, number][] | null
  errorMessage: string | null
  status?: string
  onKeyClick?: (keyName: string) => void
  selectedKey?: string | null
}

export function HotKeys({ data, errorMessage, status, onKeyClick, selectedKey }: HotKeysProps) {
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
    (sortOrder === "asc" ? R.ascend : R.descend)(R.nth(1) as (tuple: [string, number, number | null, number]) => number),
    R.defaultTo([], data),
  )

  if (status === "Pending") {
    return <LoadingState message="Loading hot keys..." />
  }

  return sortedHotKeys.length > 0 ? (
    <TableContainer
      header={
        <>
          <StaticTableHeader
            icon={<Flame className="text-primary" size={16} />}
            label="Key Name"
            width="w-2/5"
          />
          <SortableTableHeader
            active={true}
            className="text-center"
            label="Access Count"
            onClick={toggleSortOrder}
            sortOrder={sortOrder}
            width="w-1/5"
          />
          <StaticTableHeader className="text-center" label="Size" width="w-1/5" />
          <StaticTableHeader className="text-center" label="TTL" width="w-1/5" />
        </>
      }
    >
      {sortedHotKeys.map(([keyName, count, size, ttl], index) => {
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
            <td className="px-4 py-3 w-2/5">
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
            <td className="px-4 py-3 w-1/5 text-center">
              <Typography variant={"bodySm"}>
                {count.toLocaleString()}
              </Typography>
            </td>

            {/* size */}
            <td className="px-4 py-3 w-1/5 text-center">
              <Typography variant={"bodySm"}>
                {isDeleted ? "—" : formatBytes(size!)}
              </Typography>
            </td>

            {/* ttl */}
            <td className="px-4 py-3 w-1/5 text-center">
              <Typography variant={"bodySm"}>
                {isDeleted ? "—" : convertTTL(ttl)}
              </Typography>
            </td>
          </tr>
        )
      })}
    </TableContainer>
  ) : (
    <EmptyState
      action={
        errorMessage && (
          <div className="mt-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-md">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <Typography variant="bodySm">
                {errorMessage}
              </Typography>
            </div>
          </div>
        )
      }
      icon={<Flame size={48} />}
      title="No Hot Keys Found"
    />
  )
}
