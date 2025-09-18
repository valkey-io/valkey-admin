import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router"
import { Provider } from "react-redux"
import { useEffect } from "react"
import App from "./App.tsx"
import { Connection } from "@/components/connection/Connection.tsx"
import { Dashboard } from "./components/Dashboard.tsx"
import { store } from "./store.ts"
import history from "./history.ts"
import { SendCommand } from "@/components/SendCommand.tsx"
import RequireConnection from "./components/RequireConnection.tsx"
import Settings from "./components/Settings.tsx"
import LearnMore from "./components/LearnMore.tsx"
import { KeyBrowser } from "./components/KeyBrowser.tsx"
import "./css/index.css"

const AppWithHistory = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()

  useEffect(() => {
    history.location = location
    history.navigate = navigate
    history.params = params
  }, [location, navigate, params])

  return (
    <Routes>
      <Route element={<App/>}>
        <Route path="/" element={<Navigate to="/connect" replace/>}/>
        <Route path="/connect" element={<Connection/>}/>
        <Route path="/settings" element={<Settings/>}/>
        <Route path="/learnmore" element={<LearnMore/>}/>
        <Route element={<RequireConnection/>}>
          <Route path="/:id/dashboard/" element={<Dashboard/>}/>
          <Route path="/:id/sendcommand" element={<SendCommand/>}/>
          <Route path="/:id/browse" element={<KeyBrowser/>}/>
        </Route>
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById("root")!).render(
  // <StrictMode>
  <Provider store={store}>
    <BrowserRouter>
      <AppWithHistory/>
    </BrowserRouter>
  </Provider>,
  // </StrictMode>,
)
