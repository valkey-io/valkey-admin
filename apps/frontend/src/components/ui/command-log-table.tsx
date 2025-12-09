import React, { useState } from "react"
import { ArrowUp, ArrowDown, Clock } from "lucide-react"
import * as R from "ramda"

type SortOrder = "asc" | "desc"

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
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc")
  const config = logTypeConfig[logType]

  const toggleSortOrder = () => {
    setSortOrder((prev) => prev === "asc" ? "desc" : "asc")
  }

  const sortedLogs = R.defaultTo([], data)
    .flatMap((logGroup) =>
      logGroup.values.map((entry) => ({
        ...entry,
        groupTs: logGroup.ts,
      })),
    )
    .sort((sortOrder === "asc" ? R.ascend : R.descend)(R.prop("ts")))

  return (
    <div className="h-full w-full flex flex-col">
      {sortedLogs.length > 0 ? (
        <>
          {/* Header */}
          <div className="sticky top-0 z-10 border-b-2 dark:border-tw-dark-border">
            <div className="flex items-center px-4 py-3">
              <button
                className="text-xs font-bold w-1/4 flex items-center gap-2 hover:text-tw-primary transition-colors"
                onClick={toggleSortOrder}
              >
                <Clock className="text-tw-primary" size={16} />
                Timestamp
                {sortOrder === "asc" ? (
                  <ArrowUp size={14} />
                ) : (
                  <ArrowDown size={14} />
                )}
              </button>
              <div className="text-xs font-bold w-1/6 text-center">
                {config.metricLabel}
              </div>
              <div className="text-xs font-bold flex-1">
                Command
              </div>
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
                      {/* timestamp */}
                      <td className="px-4 py-2 w-1/4">
                        <span className="text-sm">
                          {new Date(entry.ts).toLocaleString()}
                        </span>
                      </td>

                      {/* metric (duration or size) */}
                      <td className="px-4 py-2 w-1/6 text-center">
                        <span className="inline-flex font-mono items-center text-sm bg-tw-primary/30 px-2 text-tw-primary rounded-full">
                          {config.metricFormat(metricValue)}
                        </span>
                      </td>

                      {/* command */}
                      <td className="px-4 py-2 flex-1">
                        <code className="text-sm font-mono text-tw-primary bg-tw-primary/20 px-3 py-1 rounded-full">
                          {entry.argv.join(" ")}
                        </code>
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
