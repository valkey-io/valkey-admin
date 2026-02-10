import { CircleQuestionMark } from "lucide-react"
import { CustomTooltip } from "./tooltip"

interface TooltipIconProps {
  size?: number;
  description?: string;
}
function TooltipIcon({ size, description }: TooltipIconProps) {
  return (
    <CustomTooltip description={description}>
      <CircleQuestionMark
        className="bg-tw-primary/10 rounded-full text-tw-primary"
        size={size}
      />
    </CustomTooltip>
  )
}

export { TooltipIcon }
