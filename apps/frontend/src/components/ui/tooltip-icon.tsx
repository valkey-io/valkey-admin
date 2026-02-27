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
        className="bg-primary/10 rounded-full text-primary"
        size={size}
      />
    </CustomTooltip>
  )
}

export { TooltipIcon }
