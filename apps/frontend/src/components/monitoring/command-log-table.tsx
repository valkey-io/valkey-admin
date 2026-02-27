import { useState } from "react"
import { Clock } from "lucide-react"
import * as R from "ramda"
import { SORT_ORDER, SORT_FIELD } from "@common/src/constants"
import { EmptyState } from "../ui/empty-state"
import { TableContainer } from "../ui/table-container"
import { SortableTableHeader, StaticTableHeader } from "../ui/sortable-table-header"
import { Typography } from "../ui/typography"

type SortOrder = typeof SORT_ORDER.ASC | typeof SORT_ORDER.DESC
type SortField = typeof SORT_FIELD.TIMESTAMP | typeof SORT_FIELD.METRIC

interface SlowLogEntry {
  id: string
  ts: number
  duration_us: number
  argv: string[]
  addr: string
  client: string
}

interface LargeLogEntry {
  id: string
  ts: number
  size: number
  argv: string[]
  addr: string
  client: string
}

interface LogGroup {
  ts: number
  metric: string
  values: (SlowLogEntry | LargeLogEntry)[]
}

type LogType = "slow" | "large-request" | "large-reply"

interface CommandLogTableProps {
  data: LogGroup[] | null
  logType: LogType
}

const logTypeConfig = {
  "slow": {
    title: "Slow Logs",
    metricLabel: "Duration",
    metricKey: "duration_us" as const,
    metricFormat: (value: number) => `${value} µs`,
    emptyMessage: "No slow logs found",
    emptySubtext: "Slow logs will appear here",
  },
  "large-request": {
    title: "Large Requests",
    metricLabel: "Request Size",
    metricKey: "size" as const,
    metricFormat: (value: number) => `${(value / 1024).toFixed(2)} KB`,
    emptyMessage: "No large requests found",
    emptySubtext: "Large requests will appear here",
  },
  "large-reply": {
    title: "Large Replies",
    metricLabel: "Reply Size",
    metricKey: "size" as const,
    metricFormat: (value: number) => `${(value / 1024).toFixed(2)} KB`,
    emptyMessage: "No large replies found",
    emptySubtext: "Large replies will appear here",
  },
}

export function CommandLogTable({ data, logType }: CommandLogTableProps) {
  const [sortField, setSortField] = useState<SortField>(SORT_FIELD.TIMESTAMP)
  const [sortOrder, setSortOrder] = useState<SortOrder>(SORT_ORDER.DESC)
  const config = logTypeConfig[logType]

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => prev === SORT_ORDER.ASC ? SORT_ORDER.DESC : SORT_ORDER.ASC)
    } else {
      setSortField(field)
      setSortOrder(SORT_ORDER.DESC)
    }
  }

  const sortedLogs = R.defaultTo([], data)
    .flatMap((logGroup) =>
      logGroup.values.map((entry) => ({
        ...entry,
        groupTs: logGroup.ts,
      })),
    )
    .sort((sortOrder === SORT_ORDER.ASC ? R.ascend : R.descend)(
      sortField === SORT_FIELD.TIMESTAMP
        ? R.prop("ts")
        : R.prop(config.metricKey as keyof typeof R.prop),
    ))

  return sortedLogs.length > 0 ? (
    <TableContainer
      header={
        <>
          <StaticTableHeader className="flex-1" label="Command" />
          <SortableTableHeader
            active={sortField === SORT_FIELD.METRIC}
            className="text-center"
            label={config.metricLabel}
            onClick={() => toggleSort(SORT_FIELD.METRIC)}
            sortOrder={sortOrder === SORT_ORDER.ASC ? "asc" : "desc"}
            width="w-1/6"
          />
          <SortableTableHeader
            active={sortField === SORT_FIELD.TIMESTAMP}
            icon={<Clock className="text-primary" size={16} />}
            label="Timestamp"
            onClick={() => toggleSort(SORT_FIELD.TIMESTAMP)}
            sortOrder={sortOrder === SORT_ORDER.ASC ? "asc" : "desc"}
            width="w-1/4"
          />
          <StaticTableHeader className="text-center" label="Client Address" width="w-1/5" />
        </>
      }
    >
      {sortedLogs.map((entry, index) => {
        const metricValue = config.metricKey in entry
          ? entry[config.metricKey as keyof typeof entry] as number
          : 0

        return (
          <tr
            className="group border-b dark:border-tw-dark-border hover:bg-primary/10"
            key={`${entry.groupTs}-${entry.id}-${index}`}
          >
            {/* command */}
            <td className="px-4 py-2 flex-1">
              <Typography className="bg-primary/30 py-1 px-2 rounded-full"  variant="code">
                {entry.argv.join(" ")}
              </Typography>
            </td>

            {/* metric (duration or size) */}
            <td className="px-4 py-2 w-1/6 text-center">
              <Typography className="" variant="bodySm">
                {config.metricFormat(metricValue)}
              </Typography>
            </td>

            {/* timestamp */}
            <td className="px-4 py-2 w-1/4 text-center">
              <Typography variant="bodySm">
                {new Date(entry.ts).toLocaleString()}
              </Typography>
            </td>

            {/* client address */}
            <td className="px-4 py-2 w-1/5 text-center">
              <Typography variant="code">
                {entry.addr}
              </Typography>
            </td>
          </tr>
        )
      })}
    </TableContainer>
  ) : (
    <EmptyState
      description={config.emptySubtext}
      icon={<Clock size={48} />}
      title={config.emptyMessage}
    />
  )
}
