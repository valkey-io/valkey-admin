import { ArrowLeft } from "lucide-react"
import { Link, useLocation } from "react-router"
import RouteContainer from "../ui/route-container"
import { Typography } from "../ui/typography"
import { Button } from "../ui/button"

export default function NotFound() {
  const location = useLocation()

  return (
    <RouteContainer title="Page Not Found">
      <div className="flex flex-col flex-1 items-center justify-center gap-4">
        <Typography variant="display">Page Not Found</Typography>
        <Typography className="text-muted-foreground" variant="bodySm">
          No page matches <Typography className="text-code" variant="code">{location.pathname}</Typography>
        </Typography>
        <Button asChild variant="default">
          <Link to="/connect"> <ArrowLeft/>Go to Connections</Link>
        </Button>
      </div>
    </RouteContainer>
  )
}
