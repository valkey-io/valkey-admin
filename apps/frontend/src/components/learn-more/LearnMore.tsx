import { CircleQuestionMark } from "lucide-react"
import RouteContainer from "../ui/route-container"
import { Typography } from "../ui/typography"

export default function LearnMore() {
  return (
    <RouteContainer title="Learn More">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <Typography className="flex items-center gap-2" variant={"heading"}>
          <CircleQuestionMark size={20}/> Learn More
        </Typography>
      </div>
      <div className="flex flex-col flex-1 items-center justify-center gap-2">
        <a
          className="text-primary underline text-body-sm"
          href="https://github.com/valkey-io/valkey-admin"
          rel="noopener noreferrer"
          target="_blank"
        >
          Valkey Admin Version 0.0.1
        </a>
        <Typography variant="bodySm">A dedicated UI for Valkey</Typography>
      </div>
    </RouteContainer>
  )
}
