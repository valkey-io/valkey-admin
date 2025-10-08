import { Button } from "@/components/ui/button.tsx"
import { ChevronRight } from "lucide-react"
import { formatTimestamp } from "@common/src/time-utils.ts"
import React from "react"

const PreviousCommand = ({ command, commandIndex, index, timestamp }) =>
  <Button
    className={`w-full overflow-hidden justify-start ${index === commandIndex ? "pointer-events-none" : ""}`}
    key={timestamp}
    onClick={() => {
      setText("")
      setCommandIndex(i)
    }}
    variant={index === commandIndex ? "ghost" : "outline"}
  >
    {index === commandIndex && <ChevronRight />}
    <span className="shrink-0 mr-2">{formatTimestamp(timestamp)}</span>
    <span className="truncate">{command}</span>
  </Button>

export default PreviousCommand
