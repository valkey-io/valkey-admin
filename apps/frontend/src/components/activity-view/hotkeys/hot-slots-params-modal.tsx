import { useEffect, useState } from "react"
import { ChartModal } from "../../ui/chart-modal"
import { Button } from "../../ui/button"
import { NumberInput } from "../../ui/number-input"
import { Typography } from "../../ui/typography"
import { TooltipIcon } from "../../ui/tooltip-icon"

interface HotSlotsParamsModalProps {
  open: boolean
  onClose: () => void
  topN: number
  onApply: (params: { topN: number }) => void
}

export function HotSlotsParamsModal({ open, onClose, topN, onApply }: HotSlotsParamsModalProps) {
  const [draftTopN, setDraftTopN] = useState(topN)

  useEffect(() => {
    setDraftTopN(topN)
  }, [topN, open])

  const handleApply = () => {
    onApply({ topN: draftTopN })
    onClose()
  }

  return (
    <ChartModal
      onClose={onClose}
      open={open}
      subtitle="Adjust how many hot keys are fetched from slot statistics"
      title="Hot Slots Config"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Typography variant="bodySm">Top N</Typography>
            <TooltipIcon
              description="Number of hottest keys to return from slot statistics."
              size={16}
            />
          </div>
          <NumberInput
            aria-label="Top N"
            min={1}
            onChange={setDraftTopN}
            step={10}
            style={{ width: "120px" }}
            value={draftTopN}
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
