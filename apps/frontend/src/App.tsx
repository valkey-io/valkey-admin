import './css/App.css'
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { setConnecting } from '@common/features/wsconnection/wsConnectionSlice';
import { SidebarProvider } from './components/ui/sidebar';
import { AppSidebar } from './components/ui/app-sidebar';
import { Outlet } from 'react-router';
import { Toaster } from './components/ui/sonner';



function App() {
  const dispatch = useDispatch()

  useEffect(() => {
    dispatch(setConnecting(true))
  }, [dispatch])




  return (

    <div className="flex min-h-screen app-container">
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
      <Outlet />
      <Toaster />

    </div>

  )
}

export default App
