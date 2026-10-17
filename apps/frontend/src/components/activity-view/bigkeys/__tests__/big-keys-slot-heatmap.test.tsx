import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { BrowserRouter } from "react-router"
import { getKeySlot } from "@common/src/cluster-slots"
import { BigKeysSlotHeatmap } from "../big-keys-slot-heatmap"
import { groupBigKeysBySlot } from "../big-keys-slot-utils"
import type { BigKey } from "@/state/valkey-features/bigkeys/bigKeysSlice"

const mockBigKeys: BigKey[] = [
  {
    key: "{user100}:profile",
    sizeBytes: 50000,
    type: "hash",
    ttl: -1,
    freq: 120,
    nodeId: "node-1",
  },
  {
    key: "{user100}:settings",
    sizeBytes: 30000,
    type: "string",
    ttl: 3600,
    freq: 85,
    nodeId: "node-1",
  },
  {
    key: "plain-key",
    sizeBytes: 15000,
    type: "string",
    ttl: -1,
    freq: 10,
    nodeId: "node-2",
  },
]

describe("BigKeysSlotHeatmap", () => {
  describe("groupBigKeysBySlot", () => {
    it("groups keys by computed slotId and merges matching hash tags", () => {
      const groups = groupBigKeysBySlot(mockBigKeys)
      expect(groups.length).toBe(2)

      const user100Slot = getKeySlot("user100")
      const user100Group = groups.find((g) => g.slotId === user100Slot)
      expect(user100Group).toBeDefined()
      expect(user100Group?.keys.length).toBe(2)
      expect(user100Group?.totalBytes).toBe(80000)
      expect(user100Group?.nodeId).toBe("node-1")

      const plainSlot = getKeySlot("plain-key")
      const plainGroup = groups.find((g) => g.slotId === plainSlot)
      expect(plainGroup).toBeDefined()
      expect(plainGroup?.keys.length).toBe(1)
      expect(plainGroup?.totalBytes).toBe(15000)
    })

    it("sorts slot groups by key count descending", () => {
      const groups = groupBigKeysBySlot(mockBigKeys)
      expect(groups[0].keys.length).toBeGreaterThanOrEqual(groups[1].keys.length)
    })
  })

  describe("component rendering", () => {
    it("renders empty state when data is empty", () => {
      render(
        <BrowserRouter>
          <BigKeysSlotHeatmap data={[]} />
        </BrowserRouter>,
      )
      expect(screen.getByText("No Big Key Slots Found")).toBeInTheDocument()
    })

    it("renders slot tiles and chips", () => {
      render(
        <BrowserRouter>
          <BigKeysSlotHeatmap data={mockBigKeys} />
        </BrowserRouter>,
      )
      expect(screen.getByText("2 slots")).toBeInTheDocument()
      expect(screen.getByText("3 big keys")).toBeInTheDocument()

      const user100Slot = getKeySlot("user100")
      expect(screen.getByText(String(user100Slot))).toBeInTheDocument()
      expect(screen.getByText("2 Keys")).toBeInTheDocument()
    })

    it("shows slot details when tile is selected", () => {
      render(
        <BrowserRouter>
          <BigKeysSlotHeatmap data={mockBigKeys} />
        </BrowserRouter>,
      )
      const user100Slot = getKeySlot("user100")
      const slotButton = screen.getByText(String(user100Slot)).closest("button")
      expect(slotButton).toBeDefined()

      fireEvent.click(slotButton!)
      expect(screen.getByText(new RegExp(`Slot ${user100Slot}`))).toBeInTheDocument()
      expect(screen.getByText("{user100}:profile")).toBeInTheDocument()
      expect(screen.getByText("{user100}:settings")).toBeInTheDocument()
    })
  })
})
