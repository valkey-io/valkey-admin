import React from "react"
import { Moon, Sun } from "lucide-react"
import { useDarkModeContext } from "@/contexts/DarkModeContext"

const ThemeToggle: React.FC = () => {
  const { isDark, toggleDarkMode } = useDarkModeContext()

  const handleClick = (mode: "dark" | "light") => {
    if ((mode === "dark" && !isDark) || (mode === "light" && isDark)) {
      toggleDarkMode()
    }
  }

  return (
    <div className="inline-flex rounded border border-gray-400 overflow-hidden text-sm font-medium mt-2">
      <button
        className={`flex items-center gap-1 px-3 py-1 transition-colors ${
          isDark
            ? "bg-tw-primary text-white"
            : "bg-white text-gray-700 hover:bg-gray-100"
        }`}
        onClick={() => handleClick("dark")}
      >
        Dark
        <Moon size={18}/>
      </button>

      <button
        className={`flex items-center gap-1 px-3 py-1 transition-colors ${
          !isDark
            ? "bg-tw-primary text-white"
            : "bg-tw-dark-primary text-white hover:bg-gray-700"
        }`}
        onClick={() => handleClick("light")}
      >
        Light
        <Sun size={18} />
      </button>
    </div>
  )
}

export default ThemeToggle
