import { InfoChip } from "../../ui/info-chip"

/**
 * Marks a collection element whose bytes aren't valid UTF-8; the server sends it escaped (\xNN).
 */
export function BinaryBadge() {
  return (
    <InfoChip className="shrink-0 self-center" tooltip="Binary data, shown escaped. It can't be edited as text.">
      binary
    </InfoChip>
  )
}
