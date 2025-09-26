import * as React from "react"

const RouteContainer = ({ children, className }: React.ComponentProps<"div">) =>
  <div className={`flex flex-col h-screen gap-4 p-4 ${className}`}>
    {children}
  </div>

export default RouteContainer
