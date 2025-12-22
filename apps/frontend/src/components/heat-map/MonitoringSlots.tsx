import { useState } from "react"
import { BrickWallFire } from "lucide-react"
import { AppHeader } from "../ui/app-header"
import { SlotVisualization } from "./SlotVisualization"
import { useParams } from "react-router"
import { nodes, largeSlotNodes } from "./DummyData"

type TabType = "hot-slots" | "large-slots"

export default function MonitoringSlots() {
  const { clusterId } = useParams<{ clusterId: string }>()
  const [activeTab, setActiveTab] = useState<TabType>("hot-slots")

  const tabs = [
    { id: "hot-slots" as TabType, label: "Hot Slots" },
    { id: "large-slots" as TabType, label: "Large Slots" },
  ]

  return (
    <div className="flex flex-col h-screen p-4 overflow-auto">
      <AppHeader icon={<BrickWallFire size={20} />} title="Monitoring Hot/Large Slots" />

      {/* Tab Navigation */}
      <div className="">
        <nav className="flex gap-x-1 border-b dark:border-tw-dark-border">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                className={`py-3 px-2 inline-flex items-center gap-x-2 border-b-2 text-sm whitespace-nowrap transition-colors
                          ${isActive
                    ? "border-tw-primary text-tw-primary"
                    : "border-transparent hover:text-tw-primary text-gray-400"
                  }
                      `}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Content based on active tab */}
      {activeTab === "hot-slots" && (
        <SlotVisualization
          data={nodes}
          type="hot"
          metricLabel="Access Count"
          metricUnit="accesses"
          clusterId={clusterId}
        />
      )}
      {activeTab === "large-slots" && (
        <SlotVisualization
          data={largeSlotNodes}
          type="large"
          metricLabel="Key Size"
          metricUnit="bytes"
          clusterId={clusterId}
        />
      )}
    </div>
  )
}
