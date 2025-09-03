import { useState, useEffect } from "react";
import { setRedirected } from "@/state/valkey-features/connection/connectionSlice.ts";
import {
  selectStatus,
  selectConnectionDetails,
  selectRedirected,
} from "@/state/valkey-features/connection/connectionSelectors.ts";
import { useAppDispatch } from "../hooks/hooks";

import { useSelector } from "react-redux";
import { useNavigate } from "react-router";
import { selectData } from "@/state/valkey-features/info/infoSelectors.ts";
import { resetConnection } from "@/state/valkey-features/connection/connectionSlice.ts";
import { HousePlug, Unplug, Pencil } from "lucide-react";
import ConnectionForm from "./ui/connection-form";
import EditForm from "./ui/edit-form";
import { CONNECTED } from "@common/src/constants";

export function Connection() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const connectionDetails = useSelector(selectConnectionDetails);
  const { server_name } = useSelector(selectData);

  const isConnected = useSelector(selectStatus) === CONNECTED;
  const hasRedirected = useSelector(selectRedirected);

  const handleDisconnect = () => {
    dispatch(resetConnection());
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
        <ConnectionForm onClose={() => setShowConnectionForm(false)} />
      )}
      {showEditForm && <EditForm onClose={() => setShowEditForm(false)} />}
      {/* Connected DBs */}
      <div className="border-t-1 mt-8 flex flex-col flex-1">
        <table className="min-w-full table-fixed divide-y">
          <thead className="text-sm bg-gray-200 sticky top-0 z-10 border-y-1 border-gray-300">
            <tr className="">
              <th className="w-1/4 font-medium py-1 text-start">
                Database Name
              </th>
              <th className="w-1/4 font-medium py-1 text-center">Host:Port</th>
              <th className="w-1/4 font-medium py-1 text-center">Activity</th>
              <th className="w-1/4 font-medium py-1 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="font-light bg-gray-50 hover:bg-gray-100">
            {isConnected ? (
              <tr>
                <td className="py-1">
                  <button
                    onClick={() => navigate("/dashboard")}
                    className="text-blue-600 hover:text-blue-800 underline cursor-pointer"
                  >
                    {server_name}
                  </button>
                </td>
                <td className="py-1 text-center">
                  {connectionDetails.host}:{connectionDetails.port}
                </td>
                <td className="py-1 text-center">TBD</td>
                <td className="text-center space-x-1 py-1">
                  <button
                    onClick={handleDisconnect}
                    title="Disconnect"
                    className="text-tw-primary hover:bg-tw-primary hover:text-white px-1 py-0.5 rounded border-1 border-tw-primary"
                  >
                    <Unplug size={14} />
                  </button>
                  <button
                    onClick={() => setShowEditForm(!showEditForm)}
                    title="Eidt Connection"
                    className="text-tw-primary hover:bg-tw-primary hover:text-white px-1 py-0.5 rounded border-1 border-tw-primary"
                  >
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
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
