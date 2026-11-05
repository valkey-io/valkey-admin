import { COMPRESSION_CODEC_LABELS, type CompressionCodec } from "@common/src/compression"
import { InfoChip } from "../../ui/info-chip"

/**
 * Passive hint from the value's leading bytes. Self-contained so it can be removed without touching decompression.
 */
export function CompressionHintBadge({ codec }: { codec?: CompressionCodec }) {
  if (!codec) return null
  return (
    <InfoChip tooltip="Guessed from the first bytes of the value. Nothing has been decoded.">
      looks like {COMPRESSION_CODEC_LABELS[codec]}
    </InfoChip>
  )
}
