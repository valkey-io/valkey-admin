import { useEffect, useState } from "react"
import { ChartModal } from "@/components/ui/chart-modal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Typography } from "@/components/ui/typography"
import { TooltipIcon } from "@/components/ui/tooltip-icon"

interface SendCommandParamsModalProps {
  open: boolean
  onClose: () => void
  historyLimit: number
  onApply: (params: { historyLimit: number }) => void
}

export function SendCommandParamsModal({
  open, onClose, historyLimit, onApply,
}: SendCommandParamsModalProps) {
  const [draftHistoryLimit, setDraftHistoryLimit] = useState(historyLimit)

  useEffect(() => {
    setDraftHistoryLimit(historyLimit)
  }, [historyLimit, open])

  const handleApply = () => {
    const clamped = Math.max(Math.round(draftHistoryLimit), 1)
    onApply({ historyLimit: clamped })
    onClose()
  }

  return (
    <ChartModal
      onClose={onClose}
      open={open}
      subtitle="Choose how many recent commands to persist"
      title="Command history settings"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Typography variant="bodySm">Commands persisted</Typography>
            <TooltipIcon
              description="Number of recent commands to persist in the history - this survives tab refreshes."
              size={16}
            />
          </div>
          <Input
            aria-label="Commands persisted in history"
            min="1"
            onChange={(e) => setDraftHistoryLimit(Number(e.target.value))}
            step="1"
            style={{ width: "120px" }}
            type="number"
            value={draftHistoryLimit}
          />
        </div>

        <div className="flex justify-end mt-2 gap-2">
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button onClick={handleApply} size="sm" type="button" variant="default">
            Apply
          </Button>
        </div>
      </div>
    </ChartModal>
  )
}
