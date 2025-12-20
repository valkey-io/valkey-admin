import { useEffect } from "react"
import { useDispatch } from "react-redux"
import { Outlet } from "react-router"
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar"
import { AppSidebar } from "./components/ui/app-sidebar"
import { Toaster } from "./components/ui/sonner"
import { DarkModeProvider } from "./contexts/DarkModeContext"
import { useWebSocketNavigation } from "./hooks/useWebSocketNavigation"
import { useValkeyConnectionNavigation } from "./hooks/useValkeyConnectionNavigation"
import { connectPending } from "@/state/wsconnection/wsConnectionSlice"

function App() {
  const dispatch = useDispatch()

  useWebSocketNavigation()
  useValkeyConnectionNavigation()

  useEffect(() => {
    dispatch(connectPending())
  }, [dispatch])

  return (
    <DarkModeProvider>
      <div className="app-container min-h-screen bg-white dark:bg-tw-dark-primary transition-colors">
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <Outlet />
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
      </div>
    </DarkModeProvider>
  )
}

export default App
