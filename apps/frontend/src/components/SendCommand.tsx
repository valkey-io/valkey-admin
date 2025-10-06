import { ChevronRight, LayoutDashboard } from "lucide-react"
import React, { useRef, useState } from "react"
import { useSelector } from "react-redux"
import { formatTimestamp } from "@common/src/time-utils.ts"
import { useParams } from "react-router"
import { useAppDispatch } from "../hooks/hooks"
import { Button } from "./ui/button"
import { getNth, selectAllCommands } from "@/state/valkey-features/command/commandSelectors.ts"
import { type CommandMetadata, sendRequested } from "@/state/valkey-features/command/commandSlice.ts"
import RouteContainer from "@/components/ui/route-container.tsx"
import { AppHeader } from "@/components/ui/app-header.tsx"

export function SendCommand() {
  const dispatch = useAppDispatch()

  const [text, setText] = useState("")
  const [commandIndex, setCommandIndex] = useState<number>(0)

  const { id } = useParams()
  const allCommands = useSelector(selectAllCommands(id!))
  const { error, response } = useSelector(getNth(commandIndex, id!)) as CommandMetadata

  const onSubmit = () => {
    dispatch(sendRequested({ command: text, connectionId: id }))
    setCommandIndex(length)
    setText("")
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onSubmit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setText("")
    }
  }

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  return (
    <RouteContainer title="Send Command">
      <AppHeader
        className="mb-0"
        icon={<LayoutDashboard size={20} />}
        title="Send Command"
      />
      <div className="flex-1 overflow-auto w-full flex flex-row gap-4">
        <pre
          className="rounded flex-1 bg-muted p-2 whitespace-pre-wrap break-words overflow-x-auto relative border dark:border-tw-dark-border">
          <h3 className="text-muted-foreground sticky top-0 text-right">Response</h3>
          <code className={`text-sm font-mono ${error ? "text-destructive" : "text-muted-foreground"}`}>
            {JSON.stringify(error ?? response, null, 4)}
          </code>
        </pre>
        <div
          className="flex flex-col whitespace-pre-wrap break-words bg-muted rounded p-2 font-mono gap-2 w-60 relative border 
          dark:border-tw-dark-border">
          <h3 className="text-muted-foreground sticky top-0">History</h3>
          {
            allCommands?.map(({ command, timestamp }, i) =>
              <Button
                className={`w-full overflow-hidden justify-start ${i === commandIndex ? "pointer-events-none" : ""}`}
                key={timestamp}
                onClick={() => {
                  setText("")
                  setCommandIndex(i)
                }}
                variant={i === commandIndex ? "ghost" : "outline"}
              >
                {i === commandIndex && <ChevronRight />}
                <span className="shrink-0 mr-2">{formatTimestamp(timestamp)}</span>
                <span className="truncate">{command}</span>
              </Button>)
          }
        </div>
      </div>
      <div className="flex items-center w-full text-sm font-light">
        <textarea
          className="flex-1 h-10 p-2 dark:border-tw-dark-border border rounded"
          onChange={(e) => setText(e.target.value)}
          onFocus={() => {
            textareaRef.current?.select()
          }}
          onKeyDown={onKeyDown}
          placeholder="Type your Valkey command here"
          ref={textareaRef}
          value={text}
        />
        <button
          className="h-10 ml-2 px-4 py-2 bg-tw-primary cursor-pointer text-white rounded hover:bg-tw-primary/70"
          onClick={onSubmit}
        >
          Send
        </button>
      </div>
    </RouteContainer>)
}
