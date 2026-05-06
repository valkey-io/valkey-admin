import { Moon, Sun } from "lucide-react"
import { ButtonGroup } from "./button-group"
import { useDarkModeContext } from "@/contexts/DarkModeContext"

const ThemeToggle = () => {
  const { isDark, toggleDarkMode } = useDarkModeContext()

  const themeOptions = [
    {
      value: "dark",
      label: (
        <>
          Dark <Moon size={18} />
        </>
      ),
    },
    {
      value: "light",
      label: (
        <>
          Light <Sun size={18} />
        </>
      ),
    },
  ]

  const handleChange = (mode: string) => {
    if ((mode === "dark" && !isDark) || (mode === "light" && isDark)) {
      toggleDarkMode()
    }
  }

  return (
    <div className="mt-2">
      <ButtonGroup
        onChange={handleChange}
        options={themeOptions}
        value={isDark ? "dark" : "light"}
      />
    </div>
  )
}

export default ThemeToggle
