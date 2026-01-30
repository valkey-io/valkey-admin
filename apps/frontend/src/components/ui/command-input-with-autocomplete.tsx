import React, { useEffect, useRef, useState } from "react"
import { Subject } from "rxjs"
import { debounceTime, map, filter, distinctUntilChanged } from "rxjs/operators"
import { AutocompleteDropdown } from "./autocomplete-dropdown"
import type { ValkeyCommand, MatchResult } from "@/types/valkey-commands"
import { matchCommands } from "@/utils/valkey-command-matching"
import { extractCommandFromText, insertCommandIntoText } from "@/utils/text-insertion"

interface CommandInputWithAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  className?: string;
  maxSuggestions?: number;
  debounceMs?: number;
  minQueryLength?: number;
  adminMode?: boolean;
}

export function CommandInputWithAutocomplete({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your Valkey command here",
  className = "",
  maxSuggestions = 10,
  debounceMs = 50,
  minQueryLength = 1,
  adminMode = false,
}: CommandInputWithAutocompleteProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputChange$ = useRef(new Subject<{ text: string; cursorPosition: number }>())

  const [cursorPosition, setCursorPosition] = useState(0)
  const [suggestions, setSuggestions] = useState<MatchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const subscription = inputChange$.current
      .pipe(
        debounceTime(debounceMs),
        map(({ text, cursorPosition }) => extractCommandFromText(text, cursorPosition)),
        distinctUntilChanged(),
        filter((query) => query.trim().length >= minQueryLength),
        map((query) => matchCommands(query.trim(), maxSuggestions, adminMode)),
      )
      .subscribe((matches) => {
        setSuggestions(matches)
        setSelectedIndex(0)
        setIsVisible(matches.length > 0)
      })

    return () => subscription.unsubscribe()
  }, [debounceMs, minQueryLength, maxSuggestions, adminMode])

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    const newCursorPosition = e.target.selectionStart || 0

    onChange(newText)
    setCursorPosition(newCursorPosition)

    if (newText.trim().length < minQueryLength) {
      setIsVisible(false)
      setSuggestions([])
    } else {
      inputChange$.current.next({ text: newText, cursorPosition: newCursorPosition })
    }
  }

  const handleCommandSelect = (command: ValkeyCommand) => {
    const { newText, newCursorPosition } = insertCommandIntoText(value, cursorPosition, command)
    onChange(newText)
    setCursorPosition(newCursorPosition)
    setIsVisible(false)

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.setSelectionRange(newCursorPosition, newCursorPosition)
        textareaRef.current.focus()
      }
    }, 0)
  }

  const hideDropdown = () => {
    setIsVisible(false)
    setSuggestions([])
    setSelectedIndex(0)
  }

  const navigateUp = () => {
    if (suggestions.length === 0) return
    setSelectedIndex((prev) => (prev - 1 < 0 ? suggestions.length - 1 : prev - 1))
  }

  const navigateDown = () => {
    if (suggestions.length === 0) return
    setSelectedIndex((prev) => (prev + 1 >= suggestions.length ? 0 : prev + 1))
  }

  const navigateToFirst = () => {
    if (suggestions.length > 0) setSelectedIndex(0)
  }

  const navigateToLast = () => {
    if (suggestions.length > 0) setSelectedIndex(suggestions.length - 1)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isVisible) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          navigateDown()
          return
        case "ArrowUp":
          e.preventDefault()
          navigateUp()
          return
        case "Home":
          if (!e.ctrlKey) {
            e.preventDefault()
            navigateToFirst()
            return
          }
          break
        case "End":
          if (!e.ctrlKey) {
            e.preventDefault()
            navigateToLast()
            return
          }
          break
        case "Enter":
        case "Tab":
          if (suggestions.length > 0) {
            e.preventDefault()
            handleCommandSelect(suggestions[selectedIndex].command)
            return
          }
          break
        case "Escape":
          e.preventDefault()
          hideDropdown()
          return
      }
    }

    if (e.key === "Enter") {
      e.preventDefault()
      if (value.trim().length > 0) {
        onSubmit()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      onChange("")
      hideDropdown()
    }
  }

  return (
    <div className="flex-1 relative">
      <textarea
        aria-autocomplete="list"
        aria-describedby="valkey-autocomplete-instructions"
        aria-expanded={isVisible}
        aria-haspopup="listbox"
        aria-owns="valkey-autocomplete-dropdown"
        className={className}
        onChange={handleTextChange}
        onFocus={() => {
          textareaRef.current?.select()
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={textareaRef}
        role="combobox"
        value={value}
      />
      <div
        className="sr-only"
        id="valkey-autocomplete-instructions"
      >
        Use arrow keys to navigate suggestions, Enter or Tab to select, Escape to close
      </div>
      <AutocompleteDropdown
        inputRef={textareaRef}
        isLoading={false}
        isVisible={isVisible}
        onClose={hideDropdown}
        onSelect={handleCommandSelect}
        selectedIndex={selectedIndex}
        suggestions={suggestions}
      />
    </div>
  )
}
