import { useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { Typography } from "../../ui/typography"
import { Button } from "../../ui/button"
import { TabGroup } from "../../ui/tab-group"
import { BigKeysDistributionContent } from "./big-keys-distribution-content"
import { BigKeysSlotHeatmap } from "./big-keys-slot-heatmap"
import type { BigKey } from "@/state/valkey-features/bigkeys/bigKeysSlice"

type HeatmapTab = "nodes" | "slots"

const TABS: Record<HeatmapTab, { title: string; description: string }> = {
  nodes: {
    title: "Node Distribution",
    description: "Big key concentration and size across cluster nodes",
  },
  slots: {
    title: "Slot Heatmap",
    description: "Big key concentration across cluster slots — select a slot to see its keys",
  },
}

interface BigKeysHeatmapModalProps {
  open: boolean
  onClose: () => void
  data: BigKey[]
  failedNodeCount?: number
  onKeyClick?: (keyName: string) => void
}

export function BigKeysHeatmapModal({
  open,
  onClose,
  data,
  failedNodeCount = 0,
  onKeyClick,
}: BigKeysHeatmapModalProps) {
  const [activeTab, setActiveTab] = useState<HeatmapTab>("nodes")

  const hasSlotData = data.some((k) => k.slotId !== undefined && k.slotId !== null)

  const tabs = [
    { id: "nodes" as HeatmapTab, label: "Nodes" },
    ...(hasSlotData ? [{ id: "slots" as HeatmapTab, label: "Slots" }] : []),
  ]
  const tab = hasSlotData ? activeTab : "nodes"

  const handleKeyClick = (keyName: string) => {
    onClose()
    onKeyClick?.(keyName)
  }

  return (
    <Dialog.Root onOpenChange={onClose} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-30 bg-black/50" />
        <Dialog.Content asChild>
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="w-[90vw] max-w-6xl h-[80vh] bg-background rounded-xl border border-border shadow-xl flex flex-col">
              <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <Dialog.Title asChild>
                    <Typography variant="subheading">{TABS[tab].title}</Typography>
                  </Dialog.Title>
                  <Dialog.Description asChild>
                    <Typography variant="bodyXs">{TABS[tab].description}</Typography>
                  </Dialog.Description>
                </div>
                <div className="flex items-start gap-4">
                  {hasSlotData && (
                    <TabGroup activeTab={tab} onChange={setActiveTab} tabs={tabs} />
                  )}
                  <Dialog.Close asChild>
                    <Button className="hover:text-primary p-1 shrink-0 -mt-1 -mr-1" size="sm" variant="ghost">
                      <X size={16} />
                    </Button>
                  </Dialog.Close>
                </div>
              </div>

              <div className="flex-1 flex flex-col px-6 py-5 min-h-0">
                {tab === "slots" ? (
                  <BigKeysSlotHeatmap
                    bigKeys={data}
                    failedNodeCount={failedNodeCount}
                    onKeyClick={handleKeyClick}
                  />
                ) : (
                  <BigKeysDistributionContent data={data} />
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
