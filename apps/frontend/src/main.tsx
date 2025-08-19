import { createRoot } from 'react-dom/client'
import './css/index.css'
import App from './App.tsx'
import { Connection } from '@/components/Connection.tsx'
import { Dashboard } from './components/Dashboard.tsx'
import { Provider } from 'react-redux'
import { store } from './store.ts'
import { BrowserRouter, Routes, Route } from "react-router";
import { SendCommand } from '@/components/SendCommand.tsx'
import RequireConnection from './components/RequireConnection.tsx'
import { Navigate } from 'react-router'

createRoot(document.getElementById('root')!).render(
  // <StrictMode>
  <Provider store={store}>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route path="/" element={<Navigate to="/connect" replace />} />
          <Route path="/connect" element={<Connection />} />
          <Route element={<RequireConnection />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sendcommand" element={<SendCommand />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  </Provider>
  // </StrictMode>,
)
