import { useState, useEffect, useCallback, useMemo } from "react"
import type { ValkeyCommand, MatchResult } from "@/types/valkey-commands"
import { matchCommands } from "@/utils/valkey-command-matching"

export interface UseValkeyAutocompleteOptions {
  maxSuggestions?: number;
  debounceMs?: number;
  minQueryLength?: number;
  adminMode?: boolean;
}

export interface AutocompleteState {
  suggestions: MatchResult[];
  selectedIndex: number;
  isVisible: boolean;
  isLoading: boolean;
}

export interface UseValkeyAutocompleteReturn {
  state: AutocompleteState;
  actions: {
    updateQuery: (query: string) => void;
    selectSuggestion: (index: number) => void;
    insertCommand: (command: ValkeyCommand, inputRef: React.RefObject<HTMLTextAreaElement>) => void;
    hide: () => void;
    show: (forceQuery?: string) => void;
    navigateUp: () => void;
    navigateDown: () => void;
    navigateToFirst: () => void;
    navigateToLast: () => void;
  };
}

export function useValkeyAutocomplete(options: UseValkeyAutocompleteOptions = {}): UseValkeyAutocompleteReturn {
  const {
    maxSuggestions = 10,
    debounceMs = 50,
    minQueryLength = 1,
    adminMode = false,
  } = options

  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isVisible, setIsVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  // Memoized suggestions based on current query
  const suggestions = useMemo(() => {
    if (!query || query.trim().length < minQueryLength) {
      return []
    }
    return matchCommands(query.trim(), maxSuggestions, adminMode)
  }, [query, maxSuggestions, minQueryLength, adminMode])

  const updateQuery = useCallback((newQuery: string) => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    if (newQuery.trim().length >= minQueryLength) {
      setIsLoading(true)
    }

    const timer = setTimeout(() => {
      setQuery(newQuery)
      setIsLoading(false)
      setSelectedIndex(0)

      const shouldShow = newQuery.trim().length >= minQueryLength
      setIsVisible(shouldShow)
    }, debounceMs)

    setDebounceTimer(timer)
  }, [debounceTimer, debounceMs, minQueryLength])

  // Select suggestion by index
  const selectSuggestion = useCallback((index: number) => {
    if (index >= 0 && index < suggestions.length) {
      setSelectedIndex(index)
    }
  }, [suggestions.length])

  const insertCommand = useCallback((command: ValkeyCommand, inputRef: React.RefObject<HTMLTextAreaElement>) => {
    if (!inputRef.current) return

    const textarea = inputRef.current
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

    while (argsStart < currentValue.length &&
           currentValue[argsStart] === " ") {
      argsStart++
    }

    let lineEnd = currentValue.indexOf("\n", argsStart)
    if (lineEnd === -1) lineEnd = currentValue.length

    if (argsStart < lineEnd) {
      existingArgs = currentValue.substring(argsStart, lineEnd)
    }

    let commandText = command.name

    if (!existingArgs.trim() && command.parameters.length > 0) {
      const placeholders = command.parameters
        .filter((param) => param.required)
        .map((param) => param.placeholder || param.name)
        .join(" ")
      commandText += ` ${placeholders}`
    } else if (existingArgs.trim()) {
      commandText += ` ${existingArgs}`
    }

    const beforeCommand = currentValue.substring(0, commandStart)
    const afterLine = currentValue.substring(lineEnd)
    const newValue = beforeCommand + commandText + afterLine

    textarea.value = newValue

    let newCursorPosition
    if (!existingArgs.trim() && command.parameters.length > 0) {
      newCursorPosition = commandStart + command.name.length + 1
    } else if (existingArgs.trim()) {
      newCursorPosition = commandStart + command.name.length + 1 + existingArgs.length
    } else {
      newCursorPosition = commandStart + command.name.length
    }

    textarea.setSelectionRange(newCursorPosition, newCursorPosition)

    const event = new Event("input", { bubbles: true })
    textarea.dispatchEvent(event)

    setIsVisible(false)
    setQuery("")

    textarea.focus()
  }, [])

  // Hide dropdown
  const hide = useCallback(() => {
    setIsVisible(false)
    setQuery("")
    setSelectedIndex(0)
  }, [])

  const show = useCallback((forceQuery?: string) => {
    const queryToUse = forceQuery !== undefined ? forceQuery : query
    if (queryToUse.trim().length >= minQueryLength || forceQuery !== undefined) {
      setIsVisible(true)
      setSelectedIndex(0)
    }
  }, [query, minQueryLength])

  // Navigate up in suggestions
  const navigateUp = useCallback(() => {
    if (suggestions.length === 0) return

    setSelectedIndex((prevIndex) => {
      const newIndex = prevIndex - 1
      return newIndex < 0 ? suggestions.length - 1 : newIndex
    })
  }, [suggestions.length])

  // Navigate down in suggestions
  const navigateDown = useCallback(() => {
    if (suggestions.length === 0) return

    setSelectedIndex((prevIndex) => {
      const newIndex = prevIndex + 1
      return newIndex >= suggestions.length ? 0 : newIndex
    })
  }, [suggestions.length])

  // Navigate to first suggestion
  const navigateToFirst = useCallback(() => {
    if (suggestions.length > 0) {
      setSelectedIndex(0)
    }
  }, [suggestions.length])

  // Navigate to last suggestion
  const navigateToLast = useCallback(() => {
    if (suggestions.length > 0) {
      setSelectedIndex(suggestions.length - 1)
    }
  }, [suggestions.length])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
    }
  }, [debounceTimer])

  // Reset selected index when suggestions change
  useEffect(() => {
    if (suggestions.length > 0 && selectedIndex >= suggestions.length) {
      setSelectedIndex(0)
    }
  }, [suggestions.length, selectedIndex])

  const state: AutocompleteState = {
    suggestions,
    selectedIndex,
    isVisible: isVisible && suggestions.length > 0,
    isLoading,
  }

  const actions = {
    updateQuery,
    selectSuggestion,
    insertCommand,
    hide,
    show,
    navigateUp,
    navigateDown,
    navigateToFirst,
    navigateToLast,
  }

  return { state, actions }
}
