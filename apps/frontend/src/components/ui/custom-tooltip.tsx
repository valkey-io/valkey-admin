import React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@radix-ui/react-tooltip"

interface CustomTooltipProps {
  children: React.ReactNode;
  content?: string;
  description?: string;
  unit?: string;
  side?: "right" | "bottom" | "left" | "top";
}

export function CustomTooltip({ children, content, description, unit, side }: CustomTooltipProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      {content &&
        <TooltipContent
          align="center"
          className={"bg-slate-600 dark:bg-slate-400 text-white px-2 py-1 rounded text-xs font-light z-10"}
          side={side || "bottom"}
          sideOffset={2}
        >
          <p>{content}</p>
        </TooltipContent>
      }
      {description &&
        <TooltipContent
          align="center"
          className={"bg-slate-600 dark:bg-slate-400 text-white px-2 py-1 mt-1 rounded text-xs font-light z-10 w-1/2"}
          side={side || "right"}
        >
          <p>{description}</p>
          {unit && (
            <p className="bg-white/20 rounded-full px-1 py-0.5 text-xs mt-1 font-medium text-white inline-block w-fit">{unit}</p>
          )}
        </TooltipContent>
      }
    </Tooltip>
  )
}
