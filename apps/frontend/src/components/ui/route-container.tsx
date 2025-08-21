import * as React from "react"

const RouteContainer = ({ children, className, title }: React.ComponentProps<"div">) =>
    <div className={`flex flex-col h-screen gap-4 p-4 ${className}`}>
        <h1 className="text-4xl font-bold text-center">{title}</h1>
        {children}
    </div>

export default RouteContainer
