import React, { useState } from "react"
import { ArrowUp, ArrowDown, Loader2, Copy, Flame, AlertCircle } from "lucide-react"
import * as R from "ramda"
import { toast } from "sonner"
import { convertTTL } from "@common/src/ttl-conversion"
import { formatBytes } from "@common/src/bytes-conversion"
import { copyToClipboard } from "@/lib/utils"

type SortOrder = "asc" | "desc"

interface HotKeysProps {
  data: [string, number, number | null, number][] | null
  status?: string
  onKeyClick?: (keyName: string) => void
  selectedKey?: string | null
}

export function HotKeys({ data, status, onKeyClick, selectedKey }: HotKeysProps) {
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
  // loader while the hotkeys are getting fetched
  if (status === "Pending") {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-tw-primary" size={32} />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Loading hot keys...
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full flex flex-col">
      {sortedHotKeys.length > 0 ? (
        <>
          {/* Header */}
          <div className="sticky top-0 z-10 border-b-2 dark:border-tw-dark-border">
            <div className="flex items-center px-4 py-3">
              <div className="flex items-center gap-2 w-2/5">
                <Flame className="text-tw-primary" size={16} />
                <span className="text-xs font-bold">Key Name</span>
              </div>
              <button
                className="text-xs font-bold w-1/5 flex items-center gap-2 hover:text-tw-primary transition-colors"
                onClick={toggleSortOrder}
              >
                Access Count
                {sortOrder === "asc" ? (
                  <ArrowUp size={14} />
                ) : (
                  <ArrowDown size={14} />
                )}
              </button>
              <div className="text-xs font-bold w-1/5 text-center">
                Size
              </div>
              <div className="text-xs font-bold w-1/5 text-center">
                TTL
              </div>
            </div>
          </div>

          {/* Contents */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full">
              <tbody>
                {sortedHotKeys.map(([keyName, count, size, ttl], index) => {
                  const isDeleted = ttl === -2
                  return (
                    <tr
                      className={`group border-b dark:border-tw-dark-border transition-all duration-200 cursor-pointer
                        ${isDeleted
                      ? "opacity-75"
                      : selectedKey === keyName
                        ? "bg-tw-primary/10 hover:bg-tw-primary/10"
                        : "hover:bg-gray-50 dark:hover:bg-neutral-800/50"
                    }`}
                      key={`${keyName}-${index}`}
                      onClick={() => onKeyClick?.(keyName)}
                    >
                      {/* key name */}
                      <td className="px-4 py-3 w-2/5">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium truncate
                            ${isDeleted
                      ? "line-through opacity-75"
                      : selectedKey === keyName
                              && "text-tw-primary font-light"
                    }`}>
                            {keyName}
                          </span>
                          {isDeleted && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full
                             bg-red-200 dark:bg-red-400">
                              <AlertCircle size={12} />
                              DELETED
                            </span>
                          )}
                          {!isDeleted && (
                            <button
                              className="p-1 rounded text-tw-primary hover:bg-tw-primary/20"
                              onClick={(e) => handleCopyKey(keyName, e)}
                            >
                              <Copy size={14} />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* access count */}
                      <td className="px-4 py-3 w-1/5">
                        <span className={`inline-flex items-center text-sm px-3 py-1 rounded-full
                          ${isDeleted
                      ? "bg-tw-dark-border/20 dark:bg-gray-700"
                      : "bg-tw-primary/20 text-tw-primary"
                    }`}>
                          {count.toLocaleString()}
                        </span>
                      </td>

                      {/* size */}
                      <td className="px-4 py-3 w-1/5 text-center">
                        <span className="font-mono text-sm">
                          {isDeleted ? "—" : formatBytes(size!)}
                        </span>
                      </td>

                      {/* ttl */}
                      <td className="px-4 py-3 w-1/5 text-center">
                        <span className="font-mono text-sm">
                          {isDeleted ? "—" : convertTTL(ttl)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="h-full flex flex-col items-center justify-center">
          <Flame className="mb-3 opacity-30" size={48} />
          <span className="text-lg font-medium">No Hot Keys Found</span>
          <span className="text-sm mt-1">Keys with frequent access will appear here</span>
        </div>
      )}
    </div>
  )
}
