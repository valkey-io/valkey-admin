import React, { useState } from "react"
import { ArrowUp, ArrowDown, Loader2, Copy } from "lucide-react"
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
      <div className="flex-1 rounded overflow-y-auto">
        {sortedHotKeys.length > 0 ? (
          <div className="h-full w-full flex flex-col">
            {/* Header */}
            <div className="bg-white dark:bg-neutral-900 border-b dark:border-neutral-700 p-4">
              <div className="flex items-center">
                <span className="text-sm font-semibold text-gray-700 dark:text-neutral-300 w-64 ml-4">
                  Key Name
                </span>
                <button
                  className="text-sm font-semibold text-gray-700 dark:text-neutral-300 w-32 flex items-center gap-2 hover:text-tw-primary"
                  onClick={toggleSortOrder}
                >
                  Access Count
                  {sortOrder === "asc" ? (
                    <ArrowUp size={16} />
                  ) : (
                    <ArrowDown size={16} />
                  )}
                </button>
                <div className="flex items-center gap-10 ml-auto mr-4 w-1/6">
                  <span className="text-sm font-semibold text-gray-700 dark:text-neutral-300 w-1/2 text-center">
                    Size
                  </span>
                  <span className="text-sm font-semibold text-gray-700 dark:text-neutral-300 w-1/2 text-center">
                    TTL
                  </span>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="">
                {sortedHotKeys.map(([keyName, count, size, ttl], index) => (
                  <div
                    className={`flex items-center border-b py-2 hover:bg-tw-primary/30 cursor-pointer
                      ${selectedKey === keyName ? "bg-tw-primary/80 hover:bg-tw-primary/80" : ""}`}
                    key={`${keyName}-${index}`}
                    onClick={() => onKeyClick?.(keyName)}
                  >
                    <div className="w-64 ml-4 flex items-center gap-2">
                      <span className={`text-sm px-2 py-1 font-mono rounded
                        ${selectedKey === keyName ? "text-white bg-white/20" : "text-tw-primary bg-tw-primary/20"}`}>
                        {keyName}
                      </span>
                      <button
                        className={`p-1 rounded hover:bg-white/20 transition-colors
                          ${selectedKey === keyName ? "text-white" : "text-gray-500 hover:text-tw-primary"}`}
                        onClick={(e) => handleCopyKey(keyName, e)}
                        title="Copy key name"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                    <span className={`text-sm w-32 font-mono text-center
                      ${selectedKey === keyName ? "text-white" : "text-gray-800 dark:text-neutral-200"}`}>
                      {count}
                    </span>
                    <div className="flex items-center gap-10 ml-auto mr-4 w-1/6">
                      <span className={`text-sm p-1 rounded w-1/2 font-mono text-center
                        ${selectedKey === keyName ? "text-white bg-white/20" : "text-tw-primary bg-tw-primary/20"}`}>
                        {formatBytes(size!)}
                      </span>
                      <span className={`text-sm p-1 rounded w-1/2 font-mono text-center
                        ${selectedKey === keyName ? "text-white bg-white/20" : "text-tw-primary bg-tw-primary/20"}`}>
                        {convertTTL(ttl)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <span className="text-lg text-gray-500 dark:text-white mb-2">
              No Hot Keys Found
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
