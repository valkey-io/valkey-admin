
import { LayoutDashboard, Unplug, Send, HousePlug, ChartNoAxesCombined } from "lucide-react";
import { setConnected as valkeySetConnected } from "@/state/valkey-features/connection/connectionSlice.ts";
import { selectConnected } from "@/state/valkey-features/connection/connectionSelectors.ts";
import { useSelector } from "react-redux";
import { useAppDispatch } from "@/hooks/hooks";
import { useNavigate, Link, useLocation } from "react-router";

export function AppSidebar() {
  const isConnected = useSelector(selectConnected);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const handleDisconnect = () => {
    dispatch(valkeySetConnected(false));
    navigate("/connect");
  };

  const getNavItemClasses = (path: string) => {
    return location.pathname === path
      ? "bg-tw-primary text-white border border-white rounded"
      : "text-gray-600 hover:text-tw-primary";
  };

  return (
    <nav className="bg-white w-18 h-screen p-4 shadow border-1 flex flex-col justify-between items-center">
      <div className="flex items-center flex-col">
        {/* Header */}
        <div className="" title="Skyscope">
          <img src="../../assets/img/logo.png" alt="logo" className="h-8" />
        </div>

        {/* menu items */}
        {isConnected && (
          <div className="mt-10">
            <ul className="space-y-4">
            <li>
                <Link
                  to="/connect"
                  className={`flex items-center justify-center p-2 ${getNavItemClasses('/connect')}`}
                  title="Connections"
                >
                  <HousePlug size={22} />
                </Link>
              </li>
              <li>
                <Link
                  to="/dashboard"
                  className={`flex items-center justify-center p-2 ${getNavItemClasses('/dashboard')}`}
                  title="Dashboard"
                >
                  <LayoutDashboard size={22} />
                </Link>
              </li>
              <li>
                <Link
                  to="/sendcommand"
                  className={`flex items-center justify-center p-2 ${getNavItemClasses("/sendcommand")}`}
                  title="Send Command"
                >
                  <Send size={22} />
                </Link>
              </li>
              <li>
                <Link
                  to="/"
                  className={`flex items-center justify-center p-2 ${getNavItemClasses("/")}`}
                  title="Monitoring"
                >
                  <ChartNoAxesCombined size={22} />
                </Link>
              </li>
            </ul>
          </div>
        )}
      </div>
      {/* disconnect */}
      {isConnected && (
        <button
          onClick={handleDisconnect}
          className="cursor-pointer p-1 rounded bg-tw-primary text-white hover:text-gray-200"
          title="Disconnect"
        >
          <Unplug size={25} />
        </button>
      )}
    </nav>
  );
}
