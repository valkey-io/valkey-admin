import { TriangleAlert } from "lucide-react"
import { Badge } from "../../ui/badge"
import { Typography } from "../../ui/typography"
import { cn } from "@/lib/utils"

interface BinaryValueProps {
  value: string | number;
  isBinary: boolean;
  className?: string;
}

/**
 * Shows a read-only value; escaped binary text has no spaces, so it is broken anywhere and badged.
 */
export function BinaryValue({ value, isBinary, className }: BinaryValueProps) {
  if (!isBinary) return <Typography className={className} variant="code">{String(value)}</Typography>
  return (
    <div className={cn("flex gap-2 min-w-0", className)}>
      <Typography className="break-all min-w-0" variant="code">{value}</Typography>
      <Badge className="shrink-0 self-start text-[10px] px-2 py-0" variant="secondary">
        binary
      </Badge>
    </div>
  )
}

interface BinaryNoticeProps {
  count: number;
  // Omit for a single value such as a string; otherwise the number of elements and what they're called.
  total?: number;
  noun?: string;
}

/**
 * One visible notice per key explaining binary data, so it doesn't rely on a hover-only tooltip.
 */
export function BinaryNotice({ count, total, noun }: BinaryNoticeProps) {
  if (count === 0) return null
  const subject = total === undefined ? "This value contains" : `${count} of ${total} ${noun} ${count === 1 ? "contains" : "contain"}`
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded bg-primary/20" role="note">
      <TriangleAlert size={14} />
      <Typography variant="bodyXs">
        {subject} binary data, shown escaped (\xNN) and read-only.
      </Typography>
    </div>
  )
}
