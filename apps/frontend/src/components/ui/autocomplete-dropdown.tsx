import React, { useEffect, useRef } from "react"
import type { MatchResult, ValkeyCommand } from "@/types/valkey-commands"
import { cn } from "@/lib/utils"

interface AutocompleteDropdownProps {
  suggestions: MatchResult[];
  selectedIndex: number;
  isVisible: boolean;
  isLoading: boolean;
  onSelect: (command: ValkeyCommand) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

interface CommandSuggestionProps {
  matchResult: MatchResult;
  isSelected: boolean;
  onClick: () => void;
  optionId: string;
}

function CommandSuggestion({ matchResult, isSelected, onClick, optionId }: CommandSuggestionProps) {
  const { command, highlightRanges } = matchResult

  const highlightText = (text: string, ranges: Array<[number, number]>) => {
    if (ranges.length === 0) return text

    const parts: React.ReactNode[] = []
    let lastIndex = 0

    ranges.forEach(([start, end], index) => {
      if (start > lastIndex) {
        parts.push(text.substring(lastIndex, start))
      }

      parts.push(
        <span
          aria-label={`Matched text: ${text.substring(start, end)}`}
          className="bg-tw-primary/30 dark:bg-tw-primary/40 font-semibold text-tw-primary dark:text-tw-primary-light rounded-sm px-0.5"
          key={index}
        >
          {text.substring(start, end)}
        </span>,
      )

      lastIndex = end
    })

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex))
    }

    return parts
  }

  return (
    <div
      aria-selected={isSelected}
      className={cn(
        "px-3 py-2 cursor-pointer border-l-2 border-transparent transition-colors",
        "hover:bg-muted/50 dark:hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-tw-primary/50",
        isSelected && "bg-muted border-l-tw-primary dark:bg-muted/50",
      )}
      id={optionId}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      role="option"
      tabIndex={-1}
    >
      <div className="flex flex-col gap-1">
        <div aria-label={`Command: ${command.name}`} className="font-mono text-sm font-medium">
          {highlightText(command.name, highlightRanges)}
        </div>
        <div aria-label={`Syntax: ${command.syntax}`} className="text-xs text-muted-foreground truncate">
          {command.syntax}
        </div>
        <div aria-label={`Description: ${command.description}`} className="text-xs text-muted-foreground/70 truncate">
          {command.description}
        </div>
      </div>
    </div>
  )
}

export function AutocompleteDropdown({
  suggestions,
  selectedIndex,
  isVisible,
  isLoading,
  onSelect,
  onClose,
  inputRef,
}: AutocompleteDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLDivElement>(null)
  const dropdownId = "valkey-autocomplete-dropdown"
  const activeDescendantId = selectedIndex >= 0 ? `${dropdownId}-option-${selectedIndex}` : undefined

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        onClose()
      }
    }

    if (isVisible) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isVisible, onClose, inputRef])

  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      })
    }
  }, [selectedIndex])

  if (!isVisible) {
    return null
  }

  return (
    <div
      aria-activedescendant={activeDescendantId}
      aria-expanded={isVisible}
      aria-label="Valkey command suggestions"
      className={cn(
        "absolute z-50 w-full bg-background border dark:border-tw-dark-border rounded-md shadow-lg",
        "max-h-96 overflow-y-auto",
      )}
      id={dropdownId}
      ref={dropdownRef}
      role="listbox"
      style={{
        bottom: "100%",
        marginBottom: "0.25rem",
      }}
    >
      {isLoading || suggestions.length === 0 ? (
        <div
          aria-live="polite"
          className="px-3 py-2 text-sm text-muted-foreground"
          role="status"
        >
          {isLoading ? "Loading suggestions..." : "No commands found"}
        </div>
      ) : (
        suggestions.map((matchResult, index) => (
          <div
            key={matchResult.command.name}
            ref={index === selectedIndex ? selectedItemRef : null}
          >
            <CommandSuggestion
              isSelected={index === selectedIndex}
              matchResult={matchResult}
              onClick={() => onSelect(matchResult.command)}
              optionId={`${dropdownId}-option-${index}`}
            />
          </div>
        ))
      )}
    </div>
  )
}
