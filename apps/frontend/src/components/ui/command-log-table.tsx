import React, { useState } from "react"
import { ArrowUp, ArrowDown, Clock } from "lucide-react"
import * as R from "ramda"
import { SORT_ORDER, SORT_FIELD } from "@common/src/constants"

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

  return (
    <div className="h-full w-full flex flex-col">
      {sortedLogs.length > 0 ? (
        <>
          {/* Header */}
          <div className="sticky top-0 z-10 border-b-2 dark:border-tw-dark-border">
            <div className="flex items-center px-4 py-3">
              <div className="text-xs font-bold flex-1">
                Command
              </div>
              <button
                className={`text-xs font-bold w-1/6 text-center flex items-center justify-center gap-2 hover:text-tw-primary transition-colors ${sortField === SORT_FIELD.METRIC ? "text-tw-primary" : ""
                }`}
                onClick={() => toggleSort(SORT_FIELD.METRIC)}
              >
                {config.metricLabel}
                {sortField === SORT_FIELD.METRIC && sortOrder === SORT_ORDER.ASC ? (
                  <ArrowUp size={14} />
                ) : (
                  <ArrowDown size={14} />
                )}
              </button>
              <button
                className={`text-xs font-bold w-1/4 flex items-center justify-center gap-2 hover:text-tw-primary transition-colors ${sortField === SORT_FIELD.TIMESTAMP ? "text-tw-primary" : ""
                }`}
                onClick={() => toggleSort(SORT_FIELD.TIMESTAMP)}
              >
                <Clock className="text-tw-primary" size={16} />
                Timestamp
                {sortField === SORT_FIELD.TIMESTAMP && sortOrder === SORT_ORDER.ASC ? (
                  <ArrowUp size={14} />
                ) : (
                  <ArrowDown size={14} />
                )}
              </button>
              <div className="text-xs font-bold w-1/5 text-center">
                Client Address
              </div>
            </div>
          </div>

          {/* Contents */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full">
              <tbody>
                {sortedLogs.map((entry, index) => {
                  const metricValue = config.metricKey in entry
                    ? entry[config.metricKey as keyof typeof entry] as number
                    : 0

                  return (
                    <tr
                      className="group border-b dark:border-tw-dark-border hover:bg-tw-primary/10"
                      key={`${entry.groupTs}-${entry.id}-${index}`}
                    >
                      {/* command */}
                      <td className="px-4 py-2 flex-1">
                        <code className="text-sm font-mono text-tw-primary bg-tw-primary/20 px-3 py-1 rounded-full">
                          {entry.argv.join(" ")}
                        </code>
                      </td>

                      {/* metric (duration or size) */}
                      <td className="px-4 py-2 w-1/6 text-center">
                        <span className="inline-flex font-mono items-center text-sm bg-tw-primary/30 px-2 text-tw-primary rounded-full">
                          {config.metricFormat(metricValue)}
                        </span>
                      </td>

                      {/* timestamp */}
                      <td className="px-4 py-2 w-1/4 text-center">
                        <span className="text-sm">
                          {new Date(entry.ts).toLocaleString()}
                        </span>
                      </td>

                      {/* client address */}
                      <td className="px-4 py-2 w-1/5 text-center">
                        <span className="text-sm font-mono">
                          {entry.addr}
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
          <Clock className="mb-3 opacity-30" size={48} />
          <span className="text-lg font-medium">{config.emptyMessage}</span>
          <span className="text-sm mt-1">{config.emptySubtext}</span>
        </div>
      )}
    </div>
  )
}
