import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import { cn } from "@/lib/utils"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        className={cn(
          "bg-slate-600 dark:bg-slate-400 text-white animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out" +
          " data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2" +
          " data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2" +
          " data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin)" +
          " rounded-md px-3 py-1.5 text-xs text-balance",
          className,
        )}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="bg-slate-600 dark:bg-slate-400 fill-slate-600 dark:fill-slate-400
        c z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

interface CustomTooltipProps {
  children: React.ReactNode;
  content?: string;
  description?: string;
  unit?: string;
}

function CustomTooltip({ children, content, description, unit }: CustomTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        {content && (
          <TooltipContent
            align="center"
            sideOffset={2}
          >
            {content}
          </TooltipContent>
        )}
        {description && (
          <TooltipContent
            align="center"
            className="max-w-xs text-left text-pretty"
          >
            {description} {unit && <span>({unit})</span>}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, CustomTooltip }
