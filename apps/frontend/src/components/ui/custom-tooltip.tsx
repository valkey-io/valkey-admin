import React from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@radix-ui/react-tooltip"

interface CustomTooltipProps {
  children: React.ReactNode;
  content: string;
}

export function CustomTooltip({ children, content }: CustomTooltipProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        align="center"
        className={"bg-tw-primary text-white px-2 py-1 mt-1 rounded text-xs font-light z-10"}
        side="bottom"
      >
        <p>{content}</p>
      </TooltipContent>
    </Tooltip>
  )
}
