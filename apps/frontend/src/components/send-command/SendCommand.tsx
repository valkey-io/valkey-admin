import { CopyIcon, GitCompareIcon, RotateCwIcon, SquareTerminal } from "lucide-react"
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
import DiffCommands from "@/components/send-command/DiffCommands.tsx"
import Response from "@/components/send-command/Response.tsx"
import { useAppDispatch } from "@/hooks/hooks.ts"
import { useValkeyAutocomplete } from "@/hooks/useValkeyAutocomplete.ts"
import { AutocompleteDropdown } from "@/components/ui/autocomplete-dropdown.tsx"

export function SendCommand() {
  const dispatch = useAppDispatch()

  const [text, setText] = useState("")
  const [commandIndex, setCommandIndex] = useState<number>(0)
  const [compareWith, setCompareWith] = useState(null)
  const [keysFilter, setKeysFilter] = useState("")
  const [historyFilter, setHistoryFilter] = useState("")

  const { id } = useParams()
  const allCommands = useSelector(selectAllCommands(id as string)) || []
  const { error, response } = useSelector(getNth(commandIndex, id as string)) as CommandMetadata

  // Initialize autocomplete hook
  const autocomplete = useValkeyAutocomplete({
    maxSuggestions: 10,
    debounceMs: 50,
    minQueryLength: 1,
  })

  const textareaRef = useRef<HTMLTextAreaElement>(null as HTMLTextAreaElement)

  const insertSelectedCommand = (command: ValkeyCommand) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const currentValue = textarea.value
    const cursorPosition = textarea.selectionStart || 0
    const lineStart = currentValue.lastIndexOf("\n", cursorPosition - 1) + 1

    let commandStart = lineStart
    while (commandStart < currentValue.length && /\s/.test(currentValue[commandStart])) {
      commandStart++
    }

    let commandEnd = commandStart
    while (commandEnd < currentValue.length &&
           /\S/.test(currentValue[commandEnd]) &&
           currentValue[commandEnd] !== "\n") {
      commandEnd++
    }

    let existingArgs = ""
    let argsStart = commandEnd

    while (argsStart < currentValue.length && currentValue[argsStart] === " ") {
      argsStart++
    }

    let lineEnd = currentValue.indexOf("\n", argsStart)
    if (lineEnd === -1) lineEnd = currentValue.length

    if (argsStart < lineEnd) {
      existingArgs = currentValue.substring(argsStart, lineEnd)
    }

    let commandText = command.name
    if (existingArgs.trim()) {
      commandText += ` ${existingArgs}`
    }

    const beforeCommand = currentValue.substring(0, commandStart)
    const afterLine = currentValue.substring(lineEnd)
    const newValue = beforeCommand + commandText + afterLine

    setText(newValue)
    autocomplete.actions.hide()

    setTimeout(() => {
      const newCursorPosition = commandStart + command.name.length + (existingArgs.trim() ? 1 + existingArgs.length : 0)
      textarea.setSelectionRange(newCursorPosition, newCursorPosition)
      textarea.focus()
    }, 0)
  }

  const onSubmit = (command?: string) => {
    dispatch(sendRequested({ command: command || text, connectionId: id }))
    setCommandIndex(length)
    setText("")
    // Hide autocomplete when submitting
    autocomplete.actions.hide()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (autocomplete.state.isVisible) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          autocomplete.actions.navigateDown()
          return
        case "ArrowUp":
          e.preventDefault()
          autocomplete.actions.navigateUp()
          return
        case "Home":
          // Only handle Home for autocomplete if Ctrl is not pressed
          if (!e.ctrlKey) {
            e.preventDefault()
            autocomplete.actions.navigateToFirst()
            return
          }
          break
        case "End":
          // Only handle End for autocomplete if Ctrl is not pressed
          if (!e.ctrlKey) {
            e.preventDefault()
            autocomplete.actions.navigateToLast()
            return
          }
          break
        case "Enter":
          if (autocomplete.state.suggestions.length > 0) {
            e.preventDefault()
            const selectedCommand = autocomplete.state.suggestions[autocomplete.state.selectedIndex]?.command
            if (selectedCommand) {
              insertSelectedCommand(selectedCommand)
              return
            }
          }
          break
        case "Tab":
          if (autocomplete.state.suggestions.length > 0) {
            e.preventDefault()
            const selectedCommand = autocomplete.state.suggestions[autocomplete.state.selectedIndex]?.command
            if (selectedCommand) {
              insertSelectedCommand(selectedCommand)
              return
            }
          }
          break
        case "Escape":
          e.preventDefault()
          autocomplete.actions.hide()
          return
      }
    }

    // Original keyboard handling for non-autocomplete cases
    if (e.key === "Enter") {
      e.preventDefault()
      if (text.trim().length > 0) {
        onSubmit()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setText("")
      autocomplete.actions.hide()
    }
  }

  const onTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    setText(newText)

    // Update autocomplete query based on current cursor position
    const cursorPosition = e.target.selectionStart || 0
    const textBeforeCursor = newText.substring(0, cursorPosition)

    // Find the current line
    const lineStart = textBeforeCursor.lastIndexOf("\n") + 1
    const currentLine = textBeforeCursor.substring(lineStart)

    // Extract the command part (first word) for autocomplete
    const commandMatch = currentLine.match(/^\s*(\S*)/)
    const commandPart = commandMatch ? commandMatch[1] : ""

    // Update autocomplete query
    autocomplete.actions.updateQuery(commandPart)
  }

  const canDiff = (index) => { // can diff only the same command, i.e. info vs info
    const currentCommand = allCommands[commandIndex]
    const targetCommand = allCommands[index]
    return currentCommand.command.toLowerCase() === targetCommand.command.toLowerCase()
  }

  return (
    <RouteContainer title="Send Command">
      <AppHeader
        className="mb-0"
        icon={<SquareTerminal size={20} />}
        title="Send Command"
      />
      <div className="flex-1 overflow-auto w-full flex flex-row gap-4">
        {/* response | diff */}
        <div className="flex flex-col flex-2">
          <h3 className="text-muted-foreground sticky top-0 text-right">{compareWith ? "Diff" : "Response"}</h3>
          <input
            className="mb-2 px-2 py-1 text-primary text-sm dark:border-tw-dark-border border rounded"
            onChange={({ target: { value } }) => setKeysFilter(value)}
            placeholder="Search Response"
            value={keysFilter}
          />
          <pre
            className="flex-1 rounded bg-muted p-2 pr-4 overflow-y-auto whitespace-pre-wrap break-words
            border dark:border-tw-dark-border relative"
          >
            <code className={`text-sm font-mono overflow-y-auto relative ${error ? "text-destructive" : "text-primary"}`}>
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
        </div>

        {/* commands history */}
        <div className="flex flex-col flex-1 max-w-[40vw]">
          <h3 className="text-muted-foreground sticky top-0">History</h3>
          <input
            className="mb-2 px-2 py-1 text-primary text-sm dark:border-tw-dark-border border rounded"
            onChange={({ target: { value } }) => setHistoryFilter(value)}
            placeholder="Search command"
            value={historyFilter}
          />
          <div
            className="flex-1 shrink whitespace-pre-wrap break-words bg-muted rounded p-2 font-mono gap-1 relative border
            dark:border-tw-dark-border overflow-y-auto">
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
        </div>
      </div>

      <div className="flex items-center w-full text-sm font-light relative">
        <div className="flex-1 relative">
          <textarea
            aria-autocomplete="list"
            aria-describedby="valkey-autocomplete-instructions"
            aria-expanded={autocomplete.state.isVisible}
            aria-haspopup="listbox"
            aria-owns="valkey-autocomplete-dropdown"
            className="w-full h-10 p-2 dark:border-tw-dark-border border rounded"
            onChange={onTextChange}
            onFocus={() => {
              textareaRef.current?.select()
            }}
            onKeyDown={onKeyDown}
            placeholder="Type your Valkey command here"
            ref={textareaRef}
            role="combobox"
            value={text}
          />
          <div
            className="sr-only"
            id="valkey-autocomplete-instructions"
          >
            Use arrow keys to navigate suggestions, Enter or Tab to select, Escape to close, Ctrl+Space to show
          </div>
          <AutocompleteDropdown
            inputRef={textareaRef}
            isLoading={autocomplete.state.isLoading}
            isVisible={autocomplete.state.isVisible}
            onClose={autocomplete.actions.hide}
            onSelect={(command) => insertSelectedCommand(command)}
            selectedIndex={autocomplete.state.selectedIndex}
            suggestions={autocomplete.state.suggestions}
          />
        </div>
        <button
          className="h-10 ml-2 px-4 py-2 bg-tw-primary cursor-pointer text-white rounded hover:bg-tw-primary/70"
          disabled={text.trim().length === 0}
          onClick={() => onSubmit()}
        >
          Send
        </button>
      </div>
    </RouteContainer>)
}
