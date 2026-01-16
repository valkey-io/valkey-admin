/* eslint-disable @typescript-eslint/no-explicit-any */
import { renderHook, act } from "@testing-library/react"
import { useValkeyAutocomplete } from "../hooks/useValkeyAutocomplete"
import * as commandMatching from "@/utils/valkey-command-matching"

vi.mock("@/utils/valkey-command-matching", () => ({
  matchCommands: vi.fn(),
}))

const mockMatchCommands = vi.mocked(commandMatching.matchCommands)

describe("useValkeyAutocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMatchCommands.mockReturnValue([])
  })

  it("should initialize with empty state", () => {
    const { result } = renderHook(() => useValkeyAutocomplete())

    expect(result.current.state.suggestions).toEqual([])
    expect(result.current.state.selectedIndex).toBe(0)
    expect(result.current.state.isVisible).toBe(false)
    expect(result.current.state.isLoading).toBe(false)
  })

  it("should update query and show suggestions", async () => {
    mockMatchCommands.mockReturnValue([
      {
        command: {
          name: "GET",
          syntax: "GET key",
          category: "string",
          description: "Get the value of a key",
          parameters: [{ name: "key", type: "key", required: true, placeholder: "key" }],
        },
        score: 1,
        matchType: "prefix",
        highlightRanges: [[0, 3]],
      },
    ])

    const { result } = renderHook(() => useValkeyAutocomplete({ debounceMs: 10 }))

    act(() => {
      result.current.actions.updateQuery("GET")
    })

    // Wait for debounce
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(result.current.state.suggestions).toHaveLength(1)
    expect(result.current.state.suggestions[0].command.name).toBe("GET")
    expect(result.current.state.isVisible).toBe(true)
  })

  it("should hide dropdown for empty query", async () => {
    const { result } = renderHook(() => useValkeyAutocomplete({ debounceMs: 10 }))

    act(() => {
      result.current.actions.updateQuery("")
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(result.current.state.isVisible).toBe(false)
  })

  it("should navigate through suggestions", async () => {
    mockMatchCommands.mockReturnValue([
      {
        command: {
          name: "GET",
          syntax: "GET key",
          category: "string",
          description: "Get the value of a key",
          parameters: [{ name: "key", type: "key", required: true, placeholder: "key" }],
        },
        score: 1,
        matchType: "prefix",
        highlightRanges: [[0, 3]],
      },
    ])

    const { result } = renderHook(() => useValkeyAutocomplete({ debounceMs: 10 }))

    act(() => {
      result.current.actions.updateQuery("GET")
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(result.current.state.selectedIndex).toBe(0)

    act(() => {
      result.current.actions.navigateDown()
    })

    // Should wrap around to 0 since there's only 1 suggestion
    expect(result.current.state.selectedIndex).toBe(0)

    act(() => {
      result.current.actions.navigateUp()
    })

    // Should wrap around to 0 since there's only 1 suggestion
    expect(result.current.state.selectedIndex).toBe(0)
  })

  it("should hide dropdown when hide action is called", async () => {
    mockMatchCommands.mockReturnValue([
      {
        command: {
          name: "GET",
          syntax: "GET key",
          category: "string",
          description: "Get the value of a key",
          parameters: [{ name: "key", type: "key", required: true, placeholder: "key" }],
        },
        score: 1,
        matchType: "prefix",
        highlightRanges: [[0, 3]],
      },
    ])

    const { result } = renderHook(() => useValkeyAutocomplete({ debounceMs: 10 }))

    act(() => {
      result.current.actions.updateQuery("GET")
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(result.current.state.isVisible).toBe(true)

    act(() => {
      result.current.actions.hide()
    })

    expect(result.current.state.isVisible).toBe(false)
  })

  it("should respect minQueryLength option", async () => {
    const { result } = renderHook(() => useValkeyAutocomplete({
      debounceMs: 10,
      minQueryLength: 2,
    }))

    act(() => {
      result.current.actions.updateQuery("G")
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(result.current.state.isVisible).toBe(false)

    mockMatchCommands.mockReturnValue([
      {
        command: {
          name: "GET",
          syntax: "GET key",
          category: "string",
          description: "Get the value of a key",
          parameters: [{ name: "key", type: "key", required: true, placeholder: "key" }],
        },
        score: 1,
        matchType: "prefix",
        highlightRanges: [[0, 2]],
      },
    ])

    act(() => {
      result.current.actions.updateQuery("GE")
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    expect(result.current.state.isVisible).toBe(true)
  })

  it("should insert command into textarea", () => {
    const { result } = renderHook(() => useValkeyAutocomplete())

    // Mock textarea element
    const mockTextarea = {
      value: "G",
      selectionStart: 1,
      setSelectionRange: vi.fn(),
      dispatchEvent: vi.fn(),
      focus: vi.fn(),
    } as any

    const mockRef = { current: mockTextarea }

    const command = {
      name: "GET",
      syntax: "GET key",
      category: "string",
      description: "Get the value of a key",
      parameters: [{ name: "key", type: "key", required: true, placeholder: "key" }],
    }

    act(() => {
      result.current.actions.insertCommand(command, mockRef)
    })

    expect(mockTextarea.value).toBe("GET key")
    expect(mockTextarea.setSelectionRange).toHaveBeenCalledWith(4, 4) // Position after "GET "
    expect(mockTextarea.focus).toHaveBeenCalled()
  })

  it("should preserve existing arguments when inserting command", () => {
    const { result } = renderHook(() => useValkeyAutocomplete())

    // Mock textarea with existing arguments
    const mockTextarea = {
      value: "G mykey",
      selectionStart: 1,
      setSelectionRange: vi.fn(),
      dispatchEvent: vi.fn(),
      focus: vi.fn(),
    } as any

    const mockRef = { current: mockTextarea }

    const command = {
      name: "GET",
      syntax: "GET key",
      category: "string",
      description: "Get the value of a key",
      parameters: [{ name: "key", type: "key", required: true, placeholder: "key" }],
    }

    act(() => {
      result.current.actions.insertCommand(command, mockRef)
    })

    expect(mockTextarea.value).toBe("GET mykey")
    expect(mockTextarea.setSelectionRange).toHaveBeenCalledWith(9, 9) // Position at end of arguments
    expect(mockTextarea.focus).toHaveBeenCalled()
  })

  it("should handle command insertion with no parameters", () => {
    const { result } = renderHook(() => useValkeyAutocomplete())

    const mockTextarea = {
      value: "PIN",
      selectionStart: 3,
      setSelectionRange: vi.fn(),
      dispatchEvent: vi.fn(),
      focus: vi.fn(),
    } as any

    const mockRef = { current: mockTextarea }

    const command = {
      name: "PING",
      syntax: "PING",
      category: "connection",
      description: "Ping the server",
      parameters: [],
    }

    act(() => {
      result.current.actions.insertCommand(command, mockRef)
    })

    expect(mockTextarea.value).toBe("PING")
    expect(mockTextarea.setSelectionRange).toHaveBeenCalledWith(4, 4) // Position at end of command
    expect(mockTextarea.focus).toHaveBeenCalled()
  })

  it("should handle multi-line command insertion", () => {
    const { result } = renderHook(() => useValkeyAutocomplete())

    const mockTextarea = {
      value: "SET key1 value1\nG",
      selectionStart: 17, // Position after 'G' on second line
      setSelectionRange: vi.fn(),
      dispatchEvent: vi.fn(),
      focus: vi.fn(),
    } as any

    const mockRef = { current: mockTextarea }

    const command = {
      name: "GET",
      syntax: "GET key",
      category: "string",
      description: "Get the value of a key",
      parameters: [{ name: "key", type: "key", required: true, placeholder: "key" }],
    }

    act(() => {
      result.current.actions.insertCommand(command, mockRef)
    })

    expect(mockTextarea.value).toBe("SET key1 value1\nGET key")
    expect(mockTextarea.setSelectionRange).toHaveBeenCalledWith(20, 20) // Position after "GET " on second line
    expect(mockTextarea.focus).toHaveBeenCalled()
  })
})
