import * as R from "ramda"
import React, { type PropsWithChildren } from "react"
import { CopyIcon } from "lucide-react"
import { cn } from "@/lib/utils.ts"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx"

export const spacing = "py-0.5 px-2 mr-2 rounded"

type KVProps = PropsWithChildren<{ className?: string, key?: string }>
export const KV = ({ className, children }: KVProps) =>
  <div
    className={cn(
      "flex flex-row flex-wrap items-center mb-1 p-1 rounded hover:bg-neutral-300 dark:hover:bg-neutral-900",
      className,
    )}
  >
    {children}
  </div>

export const KeyFilterable = ({ filter, keyPathString }: { filter: string, keyPathString: string }) =>
  <div className={cn("bg-neutral-300 dark:bg-neutral-900", spacing)}>
    {
      R.isEmpty(filter)
        ? keyPathString
        : keyPathString.split(filter).map((part, i, arr) =>
          <React.Fragment key={`${part}-${i}`}>
            <span>{part}</span>
            {
              i < arr.length - 1 &&
              <span className={cn("text-teal-700 dark:text-teal-400")}>{filter}</span>
            }
          </React.Fragment>)
    }
  </div>

export const CopyToClipboard = ({ className, onClick }: { className?: string, onClick: () => void }) =>
  <Tooltip delayDuration={1000}>
    <TooltipTrigger asChild>
      <CopyIcon
        className={cn("sticky top-1 justify-self-end cursor-pointer -mb-6 hover:text-primary", className)}
        onClick={onClick}
      />
    </TooltipTrigger>
    <TooltipContent>
      Copy to clipboard
    </TooltipContent>
  </Tooltip>
