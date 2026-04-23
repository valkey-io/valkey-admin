import { AlertCircle, Copy, Flame } from "lucide-react"
import { toast } from "sonner"
import { convertTTL } from "@common/src/ttl-conversion"
import { formatBytes } from "@common/src/bytes-conversion"
import { truncateText } from "@common/src/truncate-text"
import { TableContainer } from "../../ui/table-container"
import { SortableTableHeader, StaticTableHeader, type SortOrder } from "../../ui/sortable-table-header"
import { Typography } from "../../ui/typography"
import { CustomTooltip } from "../../ui/tooltip"
import type { HotKeyEntry } from "./hot-keys"
import { copyToClipboard } from "@/lib/utils"

interface HotKeyRowProps {
  entry: HotKeyEntry
  isSelected: boolean
  onKeyClick?: (keyName: string) => void
}

function HotKeyRow({ entry, isSelected, onKeyClick }: HotKeyRowProps) {
  const [keyName, count, size, ttl, nodeId] = entry
  const isDeleted = ttl === -2

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(keyName)
    toast.success("Key name copied!")
  }

  return (
    <tr
      className={`group border-b dark:border-tw-dark-border transition-all duration-200 cursor-pointer
        ${isDeleted
      ? "opacity-75"
      : isSelected
        ? "bg-primary/10 hover:bg-primary/10"
        : "hover:bg-gray-50 dark:hover:bg-neutral-800/50"
    }`}
      onClick={() => onKeyClick?.(keyName)}
    >
      <td className="px-4 py-3 w-1/3">
        <div className="flex items-center gap-2">
          <Typography
            className={`truncate ${isDeleted ? "line-through opacity-75" : ""}`}
            variant="code"
          >
            {keyName}
          </Typography>
          {isDeleted ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full
                     bg-red-200 dark:bg-red-400">
              <AlertCircle size={12} />
              DELETED
            </span>
          ) : (
            <button
              aria-label="Copy key name"
              className="p-1 rounded text-primary hover:bg-primary/20"
              onClick={handleCopy}
            >
              <Copy size={14} />
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3 w-1/6 text-center">
        <Typography variant="bodySm">{count.toLocaleString()}</Typography>
      </td>
      <td className="px-4 py-3 w-1/6 text-center">
        <Typography variant="bodySm">{isDeleted ? "—" : formatBytes(size!)}</Typography>
      </td>
      <td className="px-4 py-3 w-1/6 text-center">
        <Typography variant="bodySm">{isDeleted ? "—" : convertTTL(ttl)}</Typography>
      </td>
      <td className="px-4 py-3 w-1/6 text-center">
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
  isCountFiltered: boolean
  parsedCountMin: number | null
  parsedCountMax: number | null
  dataMin: number
  dataMax: number
}

function NoMatchRow({
  searchQuery, selectedNode, isCountFiltered, parsedCountMin, parsedCountMax, dataMin, dataMax,
}: NoMatchRowProps) {
  return (
    <tr>
      <td className="px-4 py-8 text-center" colSpan={5}>
        <Typography variant="bodySm">
          No keys match
          {searchQuery && (
            <Typography className="text-primary ml-1" variant="code">{searchQuery}</Typography>
          )}
          {selectedNode !== "all" && (
            <span> on node <Typography className="text-primary" variant="code">{selectedNode}</Typography></span>
          )}
          {isCountFiltered && (
            <span> with count in{" "}
              <Typography className="text-primary" variant="code">
                {parsedCountMin ?? dataMin} – {parsedCountMax ?? dataMax}
              </Typography>
            </span>
          )}
        </Typography>
      </td>
    </tr>
  )
}

interface HotKeysTableProps {
  rows: HotKeyEntry[]
  sortOrder: SortOrder
  onToggleSort: () => void
  searchQuery: string
  selectedNode: string
  isCountFiltered: boolean
  parsedCountMin: number | null
  parsedCountMax: number | null
  dataMin: number
  dataMax: number
  selectedKey?: string | null
  onKeyClick?: (keyName: string) => void
}

export function HotKeysTable({
  rows, sortOrder, onToggleSort,
  searchQuery, selectedNode,
  isCountFiltered, parsedCountMin, parsedCountMax, dataMin, dataMax,
  selectedKey, onKeyClick,
}: HotKeysTableProps) {
  return (
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
            onClick={onToggleSort}
            sortOrder={sortOrder}
            width="w-1/6"
          />
          <StaticTableHeader className="text-center" label="Size" width="w-1/6" />
          <StaticTableHeader className="text-center" label="TTL" width="w-1/6" />
          <StaticTableHeader className="text-center" label="Node" width="w-1/6" />
        </>
      }
    >
      {rows.length === 0 ? (
        <NoMatchRow
          dataMax={dataMax}
          dataMin={dataMin}
          isCountFiltered={isCountFiltered}
          parsedCountMax={parsedCountMax}
          parsedCountMin={parsedCountMin}
          searchQuery={searchQuery}
          selectedNode={selectedNode}
        />
      ) : (
        rows.map((entry, index) => (
          <HotKeyRow
            entry={entry}
            isSelected={selectedKey === entry[0]}
            key={`${entry[0]}-${index}`}
            onKeyClick={onKeyClick}
          />
        ))
      )}
    </TableContainer>
  )
}
