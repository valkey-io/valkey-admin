import {
  LayoutDashboard,
  SquareTerminal,
  HousePlug,
  ChevronLeft,
  ChevronRight,
  Cog,
  CircleQuestionMark,
  Github,
  Compass,
  Network
} from "lucide-react"
import { Link, useLocation, useParams } from "react-router"
import { useState } from "react"
import logo from "../../../assets/img/logo.png"
import useIsConnected from "@/hooks/useIsConnected.ts"

export function AppSidebar() {
  const isConnected = useIsConnected()
  const location = useLocation()
  const { id, clusterId } = useParams()
  const [isExpanded, setIsExpanded] = useState(false)

  const getNavItemClasses = (path: string) => {
    return location.pathname.endsWith(path)
      ? "bg-tw-primary text-white rounded"
      : "text-gray-600 hover:text-tw-primary"
  }

  return (
    <nav
      className={`bg-white dark:bg-tw-dark-primary ${isExpanded ? "w-52" : "w-18"
      } h-screen p-4 shadow-lg border-r-2 dark:border-tw-dark-border dark:border-r-1 flex flex-col justify-between transition-all duration-300 items-start relative`}
    >
      <div className="flex flex-col items-start w-full">
        {/* Header */}
        <div className="flex items-center" title="Skyscope">
          <img alt="logo" className="h-8" src={logo} /> {/* Use the imported logo */}
          {isExpanded && (
            <span className="ml-3 font-bold text-lg">Skyscope</span>
          )}
        </div>

        {/* menu items */}
        <div className="mt-10 flex flex-col items-stretch w-full">
          <ul className="space-y-2">
            {[
              ...(isConnected
                ? [
                  { to: (clusterId ? `/${clusterId}/${id}/connect` : `${id}/connect`), 
                    title: "Connections", 
                    icon: HousePlug },
                  {
                    to: (clusterId ? `/${clusterId}/${id}/dashboard` : `${id}/dashboard`),
                    title: "Dashboard",
                    icon: LayoutDashboard,
                  },
                  {
                    to: (clusterId ? `/${clusterId}/${id}/browse` : `/${id}/browse`),
                    title: "Key Browser",
                    icon: Compass,
                  },
                  { to: (clusterId ? `/${clusterId}/${id}/sendcommand` : `/${id}/sendcommand`), 
                    title: "Send Command", 
                    icon: SquareTerminal, 
                  },
                  ...(clusterId
                    ? [
                      {
                        to: `/${clusterId}/${id}/cluster-topology`,
                        title: "Cluster Topology",
                        icon: Network,
                      },
                    ]
                    : []),

                ]
                : [{ to: "/connect", title: "Connections", icon: HousePlug }]),
            ].map(({ to, title, icon: Icon }) => (
              <li key={to}>
                <Link
                  className={`flex p-2 dark:text-white ${getNavItemClasses(
                    to,
                  )} h-10`}
                  title={title}
                  to={to}
                >
                  <div className="flex items-center">
                    <Icon size={22} />{" "}
                    {isExpanded && <span className="ml-3 whitespace-nowrap">{title}</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* expand/collapse sidebar */}
      <button
        className="p-1 cursor-pointer rounded-full bg-white border-2 text-tw-primary 
        hover:bg-tw-primary hover:text-white absolute top-1/2 right-[-14px] z-10"
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
      >
        {isExpanded ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
      </button>
      <div className="flex flex-col items-stretch w-full">
        <ul className="space-y-2">
          {[
            {
              href: "https://github.com/",
              title: "GitHub",
              icon: Github,
              isExternal: true,
            },
            { to: "/settings", title: "Settings", icon: Cog },
            { to: "/learnmore", title: "Learn More", icon: CircleQuestionMark },
          ].map((item) => (
            <li key={item.to || item.href}>
              {item.isExternal ? (
                <a
                  className="flex p-2 text-nowrap items-center text-gray-600 dark:text-white hover:text-tw-primary h-10"
                  href={item.href}
                  rel="noopener noreferrer"
                  target="_blank"
                  title={item.title}
                >
                  <div className="flex items-center">
                    <item.icon size={22} />
                    {isExpanded && <span className="ml-3 whitespace-nowrap">{item.title}</span>}
                  </div>
                </a>
              ) : (
                <Link
                  className={`flex p-2 items-center dark:text-white ${getNavItemClasses(
                    item.to || "",
                  )} h-10`}
                  title={item.title}
                  to={item.to || ""}
                >
                  <div className="flex items-center">
                    <item.icon size={22} />
                    {isExpanded && (
                      <span className="ml-3 whitespace-nowrap">
                        {item.title}
                      </span>
                    )}
                  </div>
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
