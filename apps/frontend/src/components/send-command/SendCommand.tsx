import { CopyIcon, GitCompareIcon, RotateCwIcon, Search, SquareTerminal } from "lucide-react"
import React, { useRef, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import { toast } from "sonner"
import type { JSONObject } from "@common/src/json-utils.ts"
import { getNth, selectAllCommands } from "@/state/valkey-features/command/commandSelectors.ts"
import { type CommandMetadata, sendRequested } from "@/state/valkey-features/command/commandSlice.ts"
import RouteContainer from "@/components/ui/route-container.tsx"
import { AppHeader } from "@/components/ui/app-header.tsx"
import { cn, copyToClipboard } from "@/lib/utils.ts"
import { Timestamp } from "@/components/ui/timestamp.tsx"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import { Panel } from "@/components/ui/panel.tsx"
import DiffCommands from "@/components/send-command/DiffCommands.tsx"
import Response from "@/components/send-command/Response.tsx"
import { useAppDispatch } from "@/hooks/hooks.ts"

export function SendCommand() {
  const dispatch = useAppDispatch()

  const [text, setText] = useState("")
  const [commandIndex, setCommandIndex] = useState<number>(0)
  const [compareWith, setCompareWith] = useState<number | null>(null)
  const [keysFilter, setKeysFilter] = useState("")
  const [historyFilter, setHistoryFilter] = useState("")

  const { id } = useParams()
  const allCommands = useSelector(selectAllCommands(id as string)) || []
  const { error, response } = useSelector(getNth(commandIndex, id as string)) as CommandMetadata

  const onSubmit = (command?: string) => {
    dispatch(sendRequested({ command: command || text, connectionId: id }))
    setCommandIndex(length)
    setText("")
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (text.trim().length > 0) {
        onSubmit()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setText("")
    }
  }

  const canDiff = (index: number) => { // can diff only the same command, i.e. info vs info
    const currentCommand = allCommands[commandIndex]
    const targetCommand = allCommands[index]
    return currentCommand.command.toLowerCase() === targetCommand.command.toLowerCase()
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  return (
    <RouteContainer title="Send Command">
      <AppHeader
        icon={<SquareTerminal size={20} />}
        title="Send Command"
      />
      <div className="flex-1 overflow-auto w-full flex flex-row gap-4">
        {/* response | diff */}
        <div className="flex flex-col flex-2">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">{compareWith ? "Diff" : "Response"}</h3>
          <div className="mb-2 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10" size={18} />
            <Input
              className="pl-10"
              onChange={(e) => setKeysFilter(e.target.value)}
              placeholder="Search Response"
              value={keysFilter}
            /> </div>
          <Panel className="flex-1 bg-muted">
            <pre className="h-full overflow-y-auto whitespace-pre-wrap wrap-break-word p-2">
              <code className={`text-sm font-mono ${error ? "text-destructive" : "text-primary"}`}>
                {
                  compareWith === null ?
                    <Response
                      filter={keysFilter}
                      response={response || error as JSONObject}
                    /> :
                    <DiffCommands
                      filter={keysFilter}
                      id={id}
                      indexA={commandIndex}
                      indexB={compareWith}
                    />
                }
              </code>
            </pre>
          </Panel>
        </div>

        {/* commands history */}
        <div className="flex flex-col flex-1 max-w-[40vw]">
          <h3 className="text-muted-foreground text-sm font-medium mb-2">History</h3>
          <div className="mb-2 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10" size={18} />
            <Input
              className="pl-10"
              onChange={(e) => setHistoryFilter(e.target.value)}
              placeholder="Search command"
              value={historyFilter}
            /> </div>
          <Panel className="flex-1 bg-muted">
            <div className="h-full flex flex-col gap-1 font-mono overflow-y-auto p-2">
              {
                allCommands
                  .map((c, i) => ({ ...c, i })) // moving index inside objects because filter will ruin the sequence
                  .filter(({ command }) => command.includes(historyFilter))
                  .map(({ command, timestamp, i }) =>
                    <div
                      className={cn(
                        "flex flex-row text-sm items-center py-1 px-2 rounded",
                        (i === commandIndex) && "bg-tw-primary text-white",
                        (i === compareWith) && "bg-tw-primary-light",
                      )}
                      key={timestamp}
                    >
                      <Timestamp
                        className="opacity-70"
                        timestamp={timestamp}
                      />
                      <Tooltip delayDuration={2000}>
                        <TooltipTrigger asChild>
                          <div
                            className="truncate text-left cursor-pointer"
                            onClick={() => {
                              setText("")
                              setCompareWith(null)
                              setCommandIndex(i)
                            }}
                          >
                            {command}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          <p className="max-w-[50vw]">
                            See response for:<br/>
                            <code>{command}</code>
                          </p>
                        </TooltipContent>
                      </Tooltip>
                      <div className="flex flex-row justify-self-end ml-auto">
                        <Tooltip delayDuration={1000}>
                          <TooltipTrigger>
                            <CopyIcon
                              className={cn("size-4 ml-2 cursor-pointer")}
                              onClick={async () => {
                                await copyToClipboard(command).then(() => toast.success("Copied!"))
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            Copy
                          </TooltipContent>
                        </Tooltip>
                        {
                          i !== commandIndex && i !== compareWith && canDiff(i) &&
                          <Tooltip delayDuration={1000}>
                            <TooltipTrigger>
                              <GitCompareIcon
                                className={cn("size-4 ml-2 cursor-pointer")}
                                onClick={() => {
                                  setCompareWith(i)
                                }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              Compare with this run
                            </TooltipContent>
                          </Tooltip>
                        }
                        {
                          compareWith === null &&
                          <Tooltip delayDuration={1000}>
                            <TooltipTrigger>
                              <RotateCwIcon
                                className={cn("size-4 ml-2 cursor-pointer")}
                                onClick={() => onSubmit(command)}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              Run again
                            </TooltipContent>
                          </Tooltip>
                        }
                      </div>
                    </div>)
              }
            </div>
          </Panel>
        </div>
      </div>

      <div className="flex items-center w-full gap-2">
        <Textarea
          className="flex-1 h-10 min-h-10"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            textareaRef.current?.select()
          }}
          onKeyDown={onKeyDown}
          placeholder="Type your Valkey command here"
          ref={textareaRef}
          value={text}
        />
        <Button
          disabled={text.trim().length === 0}
          onClick={() => onSubmit()}
        >
          Send
        </Button>
      </div>
    </RouteContainer>)
}
