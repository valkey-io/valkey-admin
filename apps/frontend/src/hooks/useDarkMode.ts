import { useState, useEffect } from "react"

export const useDarkMode = () => {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Check if there is a saved theme, otherwise default to system
    const savedTheme = localStorage.getItem("theme")
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
    
    const shouldUseDark = savedTheme === "dark" || (!savedTheme && systemPrefersDark)
    
    setIsDark(shouldUseDark)
    updateDocumentClass(shouldUseDark)
  }, [])

  const updateDocumentClass = (dark: boolean) => {
    if (dark) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }

  const toggleDarkMode = () => {
    const newDarkMode = !isDark
    setIsDark(newDarkMode)
    updateDocumentClass(newDarkMode)
    localStorage.setItem("theme", newDarkMode ? "dark" : "light")
  }

  return { isDark, toggleDarkMode }
}
