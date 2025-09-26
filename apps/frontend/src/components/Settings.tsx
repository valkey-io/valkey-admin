import { Cog } from "lucide-react"
import ThemeToggle from "./ui/theme-toggle"

export default function Settings() {
  return (
    <div className="p-4 relative min-h-screen flex flex-col">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <h1 className="text-xl font-bold flex items-center gap-2 text-gray-700 dark:text-white">
          <Cog /> Settings
        </h1>
      </div>
      <div className="mt-10 pl-1">
        <h2 className="border-b-1 pb-1 dark:border-tw-dark-border font-medium text-tw-primary">Appearance</h2>
        <ThemeToggle />
      </div>
    </div>
  )
}
