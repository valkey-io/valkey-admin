import { useState, useEffect } from "react";
import {
  setRedirected,
} from "@/state/valkey-features/connection/connectionSlice.ts";
import {
  selectConnected,
  selectRedirected,
} from "@/state/valkey-features/connection/connectionSelectors.ts";
import { useAppDispatch } from "../hooks/hooks";

import { useSelector } from "react-redux";
import { useNavigate } from "react-router";
import { selectData } from "@/state/valkey-features/info/infoSelectors.ts";
import { HousePlug, Unplug } from "lucide-react";
import { setConnected as valkeySetConnected } from "@/state/valkey-features/connection/connectionSlice.ts";
import ConnectionForm from "./ui/connection-form";

export function Connection() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [showConnectionForm, setShowConnectionForm] = useState(false);

  const { server_name, tcp_port } = useSelector(selectData);

  const isConnected = useSelector(selectConnected);
  const hasRedirected = useSelector(selectRedirected);

  const handleDisconnect = () => {
    dispatch(valkeySetConnected(false));
  };

  useEffect(() => {
    if (isConnected && !hasRedirected) {
      dispatch(setRedirected(true));
      setShowConnectionForm(false);
    }
  }, [isConnected, navigate, hasRedirected, dispatch]);

  return (
    <div className="p-4 relative min-h-screen flex flex-col">
      {/* top header */}
      <div className="flex items-center justify-between h-10">
        <h1 className="text-xl font-bold flex items-center gap-2 text-gray-700">
          <HousePlug /> Connections
        </h1>
        <button
          onClick={() => setShowConnectionForm(!showConnectionForm)}
          className="bg-tw-primary text-white px-2 rounded text-sm font-light py-1 cursor-pointer"
        >
          + Add Connection
        </button>
      </div>
      {showConnectionForm && (
        <ConnectionForm
          onClose={() => setShowConnectionForm(false)}
        />
      )}
      {/* Connected DBs */}
      <div className="border-t-1 mt-8 flex flex-col flex-1">
        <table className="min-w-full table-auto divide-y divide-gray-200">
          <thead className="text-sm bg-gray-50 sticky top-0 z-10">
            <tr className="">
              <th scope="col" className="font-medium text-start">
                Database Name
              </th>
              <th scope="col" className="font-medium text-start">
                Host:Port
              </th>
              <th scope="col" className="font-medium text-start">
                Activity
              </th>
              <th scope="col"></th>
            </tr>
          </thead>
          {isConnected ? (
            <tbody className="font-light hover:bg-gray-50">
              <tr>
                <td>
                  <button
                    onClick={() => navigate("/dashboard")}
                    className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                  >
                    {server_name}
                  </button>
                </td>
                <td>{tcp_port}</td>
                <td>TBD</td>
                <td className="text-center">
                  <button
                    onClick={handleDisconnect}
                    title="Disconnect"
                    className="text-tw-primary hover:bg-tw-primary hover:text-white px-1 py-0.5 rounded border-1 border-tw-primary"
                  >
                    <Unplug size={14} />
                  </button>
                </td>
              </tr>
            </tbody>
          ) : null}
        </table>
        {!isConnected && (
          <div className=" bg-white flex-1 flex items-center justify-center flex-col gap-2">
            <span className="text-sm font-light text-gray-500">
              You Have No Connections!
            </span>
            <p className="text-sm font-light text-gray-500">
              Click "+ Add Connection" button to connect to a Valkey instance.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
