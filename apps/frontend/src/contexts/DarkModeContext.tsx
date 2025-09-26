import React, { createContext, useContext } from "react"
import { useDarkMode } from "../hooks/useDarkMode"
import type { ReactNode } from "react"

interface DarkModeContextType {
  isDark: boolean;
  toggleDarkMode: () => void;
}

const DarkModeContext = createContext<DarkModeContextType | undefined>(undefined)

interface DarkModeProviderProps {
  children: ReactNode;
}

export const DarkModeProvider = ({ children }: DarkModeProviderProps) => {
  const { isDark, toggleDarkMode } = useDarkMode()

  return (
    <DarkModeContext.Provider value={{ isDark, toggleDarkMode }}>
      {children}
    </DarkModeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useDarkModeContext = (): DarkModeContextType => {
  const context = useContext(DarkModeContext)
  if (!context) {
    throw new Error("useDarkModeContext must be used within a <DarkModeProvider>")
  }
  return context
}
