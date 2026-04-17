import { useState } from "react"
import { Clock, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"
import * as R from "ramda"
import { SORT_ORDER, SORT_FIELD } from "@common/src/constants"
import { Alert, AlertDescription } from "../ui/alert"
import { EmptyState } from "../ui/empty-state"
import { TableContainer } from "../ui/table-container"
import { SortableTableHeader, StaticTableHeader } from "../ui/sortable-table-header"
import { Typography } from "../ui/typography"
import { CustomTooltip } from "../ui/tooltip"

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
  nodeId: string,
}

type LogType = "slow" | "large-request" | "large-reply"

interface CommandLogTableProps {
  data: LogGroup[] | null
  logType: LogType
  nodeErrors?: { connectionId: string; error: string }[]
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

export function CommandLogTable({ data, logType, nodeErrors }: CommandLogTableProps) {
  const [sortField, setSortField] = useState<SortField>(SORT_FIELD.TIMESTAMP)
  const [sortOrder, setSortOrder] = useState<SortOrder>(SORT_ORDER.DESC)
  const [nodeErrorsExpanded, setNodeErrorsExpanded] = useState(false)
  const config = logTypeConfig[logType]

  const nodeErrorsBanner = nodeErrors && nodeErrors.length > 0 && (
    <div className="m-3 relative">
      <Alert
        className="cursor-pointer"
        onClick={() => setNodeErrorsExpanded((prev) => !prev)}
        variant="warning"
      >
        <AlertDescription className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Command log data is partial — {nodeErrors.length} node{nodeErrors.length > 1 ? "s " : " "} 
          failed to respond or {nodeErrors.length > 1 ? "are" : "is"} not connected
          {nodeErrorsExpanded
            ? <ChevronUp className="w-4 h-4 shrink-0 ml-auto" />
            : <ChevronDown className="w-4 h-4 shrink-0 ml-auto" />
          }
        </AlertDescription>
      </Alert>
      {nodeErrorsExpanded && (
        <ul className="absolute z-50 left-0 mt-0.5 right-0 p-3 max-h-40 overflow-y-auto space-y-0.5
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

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => prev === SORT_ORDER.ASC ? SORT_ORDER.DESC : SORT_ORDER.ASC)
    } else {
      setSortField(field)
      setSortOrder(SORT_ORDER.DESC)
    }
  }

  const truncateCommand = (argv: string[], maxLength = 40) => {
    const command = argv.join(" ")
    if (command.length <= maxLength) return command
    return command.substring(0, maxLength) + "..."
  }

  const sortedLogs = R.defaultTo([], data)
    .flatMap((logGroup) =>
      logGroup.values.map((entry) => ({
        ...entry,
        groupTs: logGroup.ts,
        nodeId: (logGroup).nodeId,
      })),
    )
    .sort((sortOrder === SORT_ORDER.ASC ? R.ascend : R.descend)(
      sortField === SORT_FIELD.TIMESTAMP
        ? R.prop("ts")
        : R.prop(config.metricKey as keyof typeof R.prop),
    ))

  return sortedLogs.length > 0 ? (
    <>
      {nodeErrorsBanner}
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
              width="w-1/6"
            />
            <StaticTableHeader className="text-center" label="Client Address" width="w-1/6" />
            <StaticTableHeader className="text-center" label="Node" width="w-1/6" />
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
                <CustomTooltip content={entry.argv.join(" ")}>
                  <Typography
                    className="bg-primary/30 py-1 px-2 rounded-full"
                    variant="code"
                  >
                    {truncateCommand(entry.argv)}
                  </Typography>
                </CustomTooltip>
              </td>

              {/* metric (duration or size) */}
              <td className="px-4 py-2 w-1/6 text-center">
                <Typography className="" variant="bodySm">
                  {config.metricFormat(metricValue)}
                </Typography>
              </td>

              {/* timestamp */}
              <td className="px-4 py-2 w-1/6 text-center">
                <Typography variant="bodySm">
                  {new Date(entry.ts).toLocaleString()}
                </Typography>
              </td>

              {/* client address */}
              <td className="px-4 py-2 w-1/6 text-center">
                <Typography variant="code">
                  {entry.addr}
                </Typography>
              </td>

              {/* node */}
              <td className="px-4 py-2 w-1/6 text-center">
                <Typography variant="code">{(entry).nodeId ?? "—"}</Typography>
              </td>
            </tr>
          )
        })}
      </TableContainer>
    </>
  ) : (
    <>
      {nodeErrorsBanner}
      <EmptyState
        description={config.emptySubtext}
        icon={<Clock size={48} />}
        title={config.emptyMessage}
      />
    </>
  )
}
