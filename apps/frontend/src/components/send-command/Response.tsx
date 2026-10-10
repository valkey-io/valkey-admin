import * as R from "ramda"
import React from "react"
import { Timer } from "lucide-react"
import { toast } from "sonner"
import { toJson, toKeyPaths, type JSONObject } from "@common/src/json-utils.ts"
import { formatExecutionTime } from "@common/src/time-utils"
import { cn, copyToClipboard } from "@/lib/utils.ts"
import { CopyToClipboard, KeyFilterable, KV, spacing } from "@/components/send-command/CommandElements.tsx"
import { TooltipIcon } from "@/components/ui/tooltip-icon.tsx"

const Response = ({ filter, response, durationMs }: { filter: string, response: JSONObject, durationMs?: number }) => {
  const normalisedFilter = filter.toLowerCase()
  const filtered =
    R.pipe(
      toKeyPaths,
      R.map((keyPath) => ({
        keyPath,
        keyPathString: keyPath.join("."),
        value: R.path(keyPath as string[], response),
        valueString: JSON.stringify(R.path(keyPath as string[], response)),
      })),
      R.isEmpty(normalisedFilter) ? R.identity :
        R.filter(({ keyPathString, valueString }) =>
          keyPathString.toLowerCase().includes(normalisedFilter) || valueString.toLowerCase().includes(normalisedFilter)),
    )(response)

  const onCopy = () =>
    R.pipe(
      R.isEmpty(normalisedFilter) // we don't need to assemble a JSON from DiffEntry[] if not filtering keys
        ? R.always(response)
        : toJson(response),
      (r) => JSON.stringify(r, null, 2),
      copyToClipboard,
      R.tap(() => toast.success("Copied!")),
    )(filtered)

  if (R.isEmpty(filtered)) return null

  return (
    <div className="flex justify-between">
      <div className="flex-1">
        {filtered.map(({ keyPath, keyPathString }) => {
          const hasKey = keyPath.length > 0 && keyPathString.trim() !== ""
        
          return (
            <KV key={keyPathString}>
              {hasKey && (
                <KeyFilterable
                  filter={filter}
                  keyPathString={keyPathString}
                />
              )}
              <div className={cn("bg-white dark:bg-black", spacing)}>
                {R.path(keyPath as string[], response)}
              </div>
            </KV>
          )
        })}
      </div>
      <div className="sticky top-1 justify-self-end flex items-center gap-2 -mb-6 ml-2 shrink-0">
        {durationMs != null && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono select-none">
            <Timer className="size-3.5" />
            <span>{formatExecutionTime(durationMs)}</span>
            <TooltipIcon
              description="Round-trip time from the server to Valkey, including network and wait time."
              size={13}
            />
          </span>
        )}
        <CopyToClipboard className="static top-auto -mb-0" onClick={onCopy} />
      </div>
    </div>
  )
}

export default Response
