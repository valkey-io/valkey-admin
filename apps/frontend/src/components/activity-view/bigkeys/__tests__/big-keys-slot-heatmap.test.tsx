import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import type { BigKey } from "@/state/valkey-features/bigkeys/bigKeysSlice"
import { BigKeysSlotHeatmap } from "@/components/activity-view/bigkeys/big-keys-slot-heatmap"

describe("BigKeysSlotHeatmap", () => {
  const mockKeys: BigKey[] = [
    {
      key: "{user100}:profile",
      sizeBytes: 1048576,
      type: "hash",
      ttl: 3600,
      freq: null,
      nodeId: "node-1",
      slotId: 8831,
    },
    {
      key: "{user100}:orders",
      sizeBytes: 2097152,
      type: "list",
      ttl: -1,
      freq: null,
      nodeId: "node-1",
      slotId: 8831,
    },
    {
      key: "foo",
      sizeBytes: 524288,
      type: "string",
      ttl: -1,
      freq: null,
      nodeId: "node-2",
      slotId: 12182,
    },
  ]

  it("renders empty state when no keys have slotId", () => {
    render(
      <MemoryRouter>
        <BigKeysSlotHeatmap bigKeys={[]} />
      </MemoryRouter>,
    )
    expect(screen.getByText("No Slot Data Found")).toBeInTheDocument()
  })

  it("renders slot tiles grouped by slotId and allows selecting a slot to view keys", () => {
    const handleKeyClick = vi.fn()

    render(
      <MemoryRouter>
        <BigKeysSlotHeatmap bigKeys={mockKeys} onKeyClick={handleKeyClick} />
      </MemoryRouter>,
    )

    // Check chips
    expect(screen.getByText("2 slots")).toBeInTheDocument()
    expect(screen.getByText("3 big keys")).toBeInTheDocument()

    // Slot 8831 holds 2 keys
    const slot8831Btn = screen.getByLabelText("Slot 8831, 2 big keys")
    expect(slot8831Btn).toBeInTheDocument()

    // Slot 12182 holds 1 key
    const slot12182Btn = screen.getByLabelText("Slot 12182, 1 big keys")
    expect(slot12182Btn).toBeInTheDocument()

    // Initial placeholder before clicking a tile
    expect(screen.getByText("Select a slot to see the big keys it holds")).toBeInTheDocument()

    // Click slot 8831
    fireEvent.click(slot8831Btn)

    // Details header shows Slot 8831
    expect(screen.getByText(/Slot 8831/)).toBeInTheDocument()
    expect(screen.getByText("{user100}:profile")).toBeInTheDocument()
    expect(screen.getByText("{user100}:orders")).toBeInTheDocument()

    // Click on a key row triggers onKeyClick callback
    fireEvent.click(screen.getByText("{user100}:profile"))
    expect(handleKeyClick).toHaveBeenCalledWith("{user100}:profile")
  })
})
