import * as R from "ramda"
import React from "react"
import { toast } from "sonner"
import { toJson, toKeyPaths, type JSONObject } from "@common/src/json-utils.ts"
import { cn, copyToClipboard } from "@/lib/utils.ts"
import { CopyToClipboard, KeyFilterable, KV, spacing } from "@/components/send-command/CommandElements.tsx"

const Response = ({ filter, response }: { filter: string, response: JSONObject }) => {
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
    <>
      <CopyToClipboard onClick={onCopy} />
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
    </>
  )
}

export default Response
