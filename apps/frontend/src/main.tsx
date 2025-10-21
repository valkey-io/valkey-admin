import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router"
import { Provider } from "react-redux"
import { useEffect } from "react"
import App from "./App.tsx"
import { Dashboard } from "./components/Dashboard.tsx"
import { store } from "./store.ts"
import history from "./history.ts"
import RequireConnection from "./components/RequireConnection.tsx"
import Settings from "./components/Settings.tsx"
import LearnMore from "./components/LearnMore.tsx"
import { KeyBrowser } from "./components/KeyBrowser.tsx"
import { Cluster } from "./components/Cluster.tsx"
import { SendCommand } from "@/components/send-command/SendCommand.tsx"
import { Connection } from "@/components/connection/Connection.tsx"
import "./css/index.css"

// eslint-disable-next-line react-refresh/only-export-components
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
      <Route element={<App />}>
        <Route element={<Navigate replace to="/connect"/>} path="/"/>
        <Route element={<Connection />} path="/connect" />
        <Route element={<Settings />} path="/settings" />
        <Route element={<LearnMore />} path="/learnmore" />

        {/* Routes with clusterId */}
        <Route element={<RequireConnection />}>
          <Route element={<Dashboard />} path="/:clusterId/:id/dashboard" />
          <Route element={<SendCommand />} path="/:clusterId/:id/sendcommand" />
          <Route element={<KeyBrowser />} path="/:clusterId/:id/browse" />
          <Route element={<Cluster />} path="/:clusterId/:id/cluster-topology"/>
        </Route>

        {/* Routes without clusterId */}
        <Route element={<RequireConnection />}>
          <Route element={<Dashboard />} path="/:id/dashboard" />
          <Route element={<SendCommand />} path="/:id/sendcommand" />
          <Route element={<KeyBrowser />} path="/:id/browse" />
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
