import {createRoot} from 'react-dom/client'
import {BrowserRouter, Navigate, Route, Routes} from 'react-router'
import {Provider} from 'react-redux'
import App from './App.tsx'
import {Connection} from '@/components/Connection.tsx'
import {Dashboard} from './components/Dashboard.tsx'
import {store} from './store.ts'
import {SendCommand} from '@/components/SendCommand.tsx'
import RequireConnection from './components/RequireConnection.tsx'
import './css/index.css'

createRoot(document.getElementById('root')!).render(
    // <StrictMode>
    <Provider store={store}>
        <BrowserRouter>
            <Routes>
                <Route element={<App/>}>
                    <Route path="/" element={<Navigate to="/connect" replace/>}/>
                    <Route path="/connect" element={<Connection/>}/>
                    <Route element={<RequireConnection/>}>
                        <Route path="/dashboard" element={<Dashboard/>}/>
                        <Route path="/sendcommand" element={<SendCommand/>}/>
                    </Route>
                </Route>
            </Routes>
        </BrowserRouter>
    </Provider>
    // </StrictMode>,
)
