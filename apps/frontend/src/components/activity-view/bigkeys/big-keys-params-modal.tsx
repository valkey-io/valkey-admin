import { useEffect, useState } from "react"
import { ChartModal } from "../../ui/chart-modal"
import { Button } from "../../ui/button"
import { NumberInput } from "../../ui/number-input"
import { Typography } from "../../ui/typography"
import { TooltipIcon } from "../../ui/tooltip-icon"

interface BigKeysParamsModalProps {
  open: boolean
  onClose: () => void
  scanLimit: number
  topN: number
  onScan: (params: { scanLimit: number; topN: number }) => void
}

export function BigKeysParamsModal({ open, onClose, scanLimit, topN, onScan }: BigKeysParamsModalProps) {
  const [draftScanLimit, setDraftScanLimit] = useState(scanLimit)
  const [draftTopN, setDraftTopN] = useState(topN)

  useEffect(() => {
    setDraftScanLimit(scanLimit)
    setDraftTopN(topN)
  }, [scanLimit, topN, open])

  const handleScan = () => {
    onScan({ scanLimit: draftScanLimit, topN: draftTopN })
    onClose()
  }

  return (
    <ChartModal
      onClose={onClose}
      open={open}
      subtitle="Adjust how the keyspace is scanned for the largest keys"
      title="Scan Settings"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Typography variant="bodySm">Scan Limit</Typography>
            <TooltipIcon
              description={"Maximum number of keys to sample per node. Higher values scan more"
                + " of the keyspace but take longer."}
              size={16}
            />
          </div>
          <NumberInput
            aria-label="Scan Limit"
            min={1}
            onChange={setDraftScanLimit}
            step={1000}
            style={{ width: "120px" }}
            value={draftScanLimit}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Typography variant="bodySm">Top N</Typography>
            <TooltipIcon
              description="Number of largest keys to return from the scan."
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
          <Button onClick={handleScan} size="sm" type="button" variant="default">
            Scan
          </Button>
        </div>
      </div>
    </ChartModal>
  )
}
