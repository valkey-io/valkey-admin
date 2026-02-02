import { createRoot } from "react-dom/client"
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router"
import { Provider } from "react-redux"
import { useEffect } from "react"
import App from "./App.tsx"
import { Dashboard } from "./components/dashboard/Dashboard.tsx"
import { store } from "./store.ts"
import history from "./history.ts"
import RequireConnection from "./components/RequireConnection.tsx"
import Settings from "./components/settings/Settings.tsx"
import LearnMore from "./components/learn-more/LearnMore.tsx"
import { KeyBrowser } from "./components/key-browser/KeyBrowser.tsx"
import { Cluster } from "./components/cluster-topology/Cluster.tsx"
import { WebSocketReconnect } from "./components/WebSocketReconnect.tsx"
import { ValkeyReconnect } from "./components/ValkeyReconnect.tsx"
import { SendCommand } from "@/components/send-command/SendCommand.tsx"
import { Monitoring } from "@/components/monitoring/Monitoring.tsx"
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
        <Route element={<Navigate replace to="/connect" />} path="/" />
        <Route element={<Connection />} path="/connect" />
        <Route element={<WebSocketReconnect />} path="/reconnect" />
        <Route element={<Settings />} path="/settings" />
        <Route element={<LearnMore />} path="/learnmore" />
        <Route element={<ValkeyReconnect />} path="/:id/valkey-reconnect" />
        
        {/* Routes with clusterId */}
        <Route element={<RequireConnection />}>
          <Route element={<Connection />} path="/:clusterId/:id/connect" />
          <Route element={<Dashboard />} path="/:clusterId/:id/dashboard" />
          <Route element={<SendCommand />} path="/:clusterId/:id/sendcommand" />
          <Route element={<KeyBrowser />} path="/:clusterId/:id/browse" />
          <Route element={<Cluster />} path="/:clusterId/:id/cluster-topology" />
          <Route element={<Monitoring />} path="/:clusterId/:id/monitoring" />
          <Route element={<Settings />} path="/:clusterId/:id/settings" />
        </Route>

        {/* Routes without clusterId */}
        <Route element={<RequireConnection />}>
          <Route element={<Connection />} path="/:id/connect" />
          <Route element={<Dashboard />} path="/:id/dashboard" />
          <Route element={<SendCommand />} path="/:id/sendcommand" />
          <Route element={<KeyBrowser />} path="/:id/browse" />
          <Route element={<Monitoring />} path="/:id/monitoring" />
          <Route element={<Settings />} path="/:id/settings" />
          <Route element={<LearnMore />} path="/:id/learnmore" />
        </Route>
      </Route>
    </Routes>
  )
}

createRoot(document.getElementById("root")!).render(
  // <StrictMode>
  <Provider store={store}>
    <HashRouter>
      <AppWithHistory />
    </HashRouter>
  </Provider>,
  // </StrictMode>,
)
