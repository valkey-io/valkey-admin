import * as R from "ramda"
import React from "react"
import { useSelector } from "react-redux"
import { toast } from "sonner"
import { diff, diffToJson, type JSONObject } from "@common/src/json-utils.ts"
import type { CommandMetadata } from "@/state/valkey-features/command/commandSlice.ts"
import { getNth } from "@/state/valkey-features/command/commandSelectors.ts"
import { cn, copyToClipboard } from "@/lib/utils.ts"
import { CopyToClipboard, KeyFilterable, KV, spacing } from "@/components/send-command/CommandElements.tsx"

const DiffCommands = ({ filter, id, indexA, indexB }) => {
  const A = useSelector(getNth(indexA, id as string)) as CommandMetadata as JSONObject
  const B = useSelector(getNth(indexB, id as string)) as CommandMetadata as JSONObject

  const diffs = diff(A.response, B.response)

  if (R.isEmpty(diffs)) return "Responses are identical"

  const normalisedFilter = filter.toLowerCase()
  const filteredDiffs = normalisedFilter ? diffs.filter(({ keyPathString }) => keyPathString.toLowerCase().includes(normalisedFilter)) : diffs

  const onCopy = () =>
    R.pipe(
      diffToJson,
      (r) => JSON.stringify(r, null, 2),
      copyToClipboard,
      R.tap(() => toast.success("Copied!")),
    )(filteredDiffs)

  return (
    <div className="flex justify-between">
      <div className="flex-1">

        {
          filteredDiffs.map(({ keyPathString, valueA, valueB }) =>
            <KV key={keyPathString}>
              {
                R.isNil(valueB) &&
              <div className={cn("bg-emerald-200 dark:bg-emerald-800", spacing)}>+</div>
              }
              {
                R.isNil(valueA) &&
              <div className={cn("bg-pink-200 dark:bg-pink-800", spacing)}>-</div>
              }

              <KeyFilterable
                filter={filter}
                keyPathString={keyPathString}
              />

              {
                (R.isNil(valueA) || R.isNil(valueB)) &&
              <div className={cn(spacing)}>{valueA || valueB}</div>
              }
              {
                R.isNotNil(valueA) && R.isNotNil(valueB) &&
              <>
                <div className={cn("bg-teal-50 dark:bg-teal-950", spacing)}>{valueA}</div>
                <div className={cn("bg-teal-200 dark:bg-teal-800", spacing)}>{valueB}</div>
              </>
              }
            </KV>)
        }
      </div>
      <CopyToClipboard onClick={onCopy} />
    </div>
  )
}

export default DiffCommands
