import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton
} from "@/components/ui/sidebar"
import { setConnected as valkeySetConnected } from "@/state/valkey-features/connection/valkeyConnectionSlice"
import { selectConnected } from "@/state/valkey-features/connection/valkeyConnectionSelectors.ts"
import { useSelector } from "react-redux"
import { Button } from "./button"
import { useAppDispatch } from "@/hooks/hooks"
import { useNavigate, Link } from "react-router"

export function AppSidebar() {
    const isConnected = useSelector(selectConnected)
    const dispatch = useAppDispatch()
    const navigate = useNavigate()

    const handleDisconnect = () => {
        dispatch(valkeySetConnected(false))
        navigate("/connect")
    }
    return (
        <Sidebar className="app-sidebar h-dvh flex flex-col">
            <SidebarHeader className="text-4xl font-bold text-center p-4">
                Skyscope
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarMenu>
                        <SidebarMenuItem key="Connection">
                            {isConnected &&
                                <>
                                    <SidebarMenuButton asChild>
                                        <Link to="/sendcommand">Send Command</Link>
                                    </SidebarMenuButton>
                                    <SidebarMenuButton asChild>
                                        <Link to="/dashboard">Dashboard</Link>
                                    </SidebarMenuButton>
                                </>
                            }
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="p-4">
                {isConnected &&
                    <SidebarMenuButton asChild>
                        <Button onClick={handleDisconnect} variant="outline">
                            Disconnect
                        </Button>
                    </SidebarMenuButton>
                }
            </SidebarFooter>
        </Sidebar>
    )
}


