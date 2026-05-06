import { Cog } from "lucide-react"
import ThemeToggle from "../ui/theme-toggle"
import RouteContainer from "../ui/route-container"
import { Typography } from "../ui/typography"

export default function Settings() {
  return (
    <RouteContainer className="p-4 relative min-h-screen flex flex-col">
      <div className="flex items-center justify-between h-10">
        <Typography className="flex items-center gap-2" variant="heading">
          <Cog size={20}/> Settings
        </Typography>
      </div>
      <div className="mt-4 pl-1 flex flex-col gap-3">
        <Typography className="border-b pb-1" variant={"label"}>Appearance</Typography>
        <ThemeToggle />
      </div>
    </RouteContainer>
  )
}

