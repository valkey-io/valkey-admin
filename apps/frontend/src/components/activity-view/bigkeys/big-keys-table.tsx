import { Copy, KeyRound } from "lucide-react"
import { toast } from "sonner"
import { convertTTL } from "@common/src/ttl-conversion"
import { formatBytes } from "@common/src/bytes-conversion"
import { truncateText } from "@common/src/truncate-text"
import { TableContainer } from "../../ui/table-container"
import { SortableTableHeader, StaticTableHeader, type SortOrder } from "../../ui/sortable-table-header"
import { Typography } from "../../ui/typography"
import { CustomTooltip } from "../../ui/tooltip"
import { TooltipIcon } from "../../ui/tooltip-icon"
import type { BigKey } from "@/state/valkey-features/bigkeys/bigKeysSlice"
import { copyToClipboard } from "@/lib/utils"

interface BigKeyRowProps {
  entry: BigKey
  showFrequency: boolean
}

function BigKeyRow({ entry, showFrequency }: BigKeyRowProps) {
  const { key, sizeBytes, type, ttl, freq, nodeId } = entry

  const handleCopy = () => {
    copyToClipboard(key)
    toast.success("Key name copied!")
  }

  return (
    <tr className="group border-b dark:border-tw-dark-border transition-all duration-200 hover:bg-gray-50 dark:hover:bg-neutral-800/50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Typography className="truncate" variant="code">{key}</Typography>
          <button
            aria-label="Copy key name"
            className="p-1 rounded text-primary hover:bg-primary/20"
            onClick={handleCopy}
          >
            <Copy size={14} />
          </button>
        </div>
      </td>
      <td className="px-4 py-3 w-[15%] text-center">
        <Typography variant="code">{type}</Typography>
      </td>
      <td className="px-4 py-3 w-[15%] text-center">
        <Typography variant="bodySm">{formatBytes(sizeBytes)}</Typography>
      </td>
      {showFrequency && (
        <td className="px-4 py-3 w-[15%] text-center">
          <Typography variant="bodySm">{freq ?? "—"}</Typography>
        </td>
      )}
      <td className="px-4 py-3 w-[15%] text-center">
        <Typography variant="bodySm">{convertTTL(ttl)}</Typography>
      </td>
      <td className="px-4 py-3 w-[15%] text-center">
        <CustomTooltip content={nodeId ?? "-"}>
          <Typography variant="code">{truncateText(nodeId ?? "—")}</Typography>
        </CustomTooltip>
      </td>
    </tr>
  )
}

interface NoMatchRowProps {
  searchQuery: string
  selectedNode: string
}

function NoMatchRow({ searchQuery, selectedNode }: NoMatchRowProps) {
  return (
    <tr>
      <td className="px-4 py-8 text-center" colSpan={6}>
        <Typography variant="bodySm">
          No keys match
          {searchQuery && (
            <Typography className="text-primary ml-1" variant="code">{searchQuery}</Typography>
          )}
          {selectedNode !== "all" && (
            <span> on node <Typography className="text-primary" variant="code">{selectedNode}</Typography></span>
          )}
        </Typography>
      </td>
    </tr>
  )
}

export type BigKeysSortKey = "sizeBytes" | "freq"

interface BigKeysTableProps {
  rows: BigKey[]
  sortKey: BigKeysSortKey
  sortOrder: SortOrder
  onSort: (key: BigKeysSortKey) => void
  searchQuery: string
  selectedNode: string
  showFrequency: boolean
}

export function BigKeysTable({
  rows, sortKey, sortOrder, onSort, searchQuery, selectedNode, showFrequency,
}: BigKeysTableProps) {
  return (
    <TableContainer
      header={
        <>
          <StaticTableHeader
            icon={<KeyRound className="text-primary" size={16} />}
            label="Key Name"
            width="flex-1"
          />
          <StaticTableHeader className="text-center" label="Type" width="w-[15%]" />
          <SortableTableHeader
            active={sortKey === "sizeBytes"}
            className="text-center"
            label="Size"
            onClick={() => onSort("sizeBytes")}
            sortOrder={sortOrder}
            width="w-[15%]"
          />
          {showFrequency && (
            <SortableTableHeader
              active={sortKey === "freq"}
              className="text-center"
              label={
                <span className="flex items-center gap-1">
                  Frequency
                  <TooltipIcon
                    description="Access frequency from OBJECT FREQ. Higher means accessed more often. 
                    Requires an LFU maxmemory-policy; otherwise unavailable."
                    size={14}
                  />
                </span>
              }
              onClick={() => onSort("freq")}
              sortOrder={sortOrder}
              width="w-[15%]"
            />
          )}
          <StaticTableHeader className="text-center" label="TTL" width="w-[15%]" />
          <StaticTableHeader className="text-center" label="Node" width="w-[15%]" />
        </>
      }
    >
      {rows.length === 0 ? (
        <NoMatchRow searchQuery={searchQuery} selectedNode={selectedNode} />
      ) : (
        rows.map((entry, index) => (
          <BigKeyRow
            entry={entry}
            key={`${entry.key}-${index}`}
            showFrequency={showFrequency}
          />
        ))
      )}
    </TableContainer>
  )
}
