import { useAppDispatch } from "@/hooks/hooks";
import { X } from "lucide-react";

type EditFormProps = {
  onClose: () => void;
};

import {
  updateConnectionDetails,
  connectPending,
} from "@/state/valkey-features/connection/connectionSlice.ts";
// import { resetConnection } from "@/epics/valkey-features/connection/connectionSlice.ts";
import { selectConnectionDetails } from "@/state/valkey-features/connection/connectionSelectors";
import { useState, useEffect } from "react";
import { useSelector } from "react-redux";

function EditForm({ onClose }: EditFormProps) {
  const dispatch = useAppDispatch();
  const currentConnection = useSelector(selectConnectionDetails);
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("6379");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Load existing connection data when component mounts
  useEffect(() => {
    if (currentConnection) {
      setHost(currentConnection.host);
      setPort(currentConnection.port);
      setUsername(currentConnection.username || "");
      setPassword(currentConnection.password || "");
    }
  }, [currentConnection]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Update stored connection
    dispatch(
      updateConnectionDetails({
        host,
        port,
        username,
        password,
      })
    );

    // Disconnect First
    // dispatch(resetConnection());

    // Then Reconnect
    setTimeout(() => {
      dispatch(
        connectPending({
          host,
          port,
          username,
          password,
        })
      );
    }, 100);

    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="w-full max-w-md p-6 bg-white dark:bg-tw-dark-primary dark:border-tw-dark-border rounded-lg shadow-lg border">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Edit Connection</h2>
          <button onClick={onClose} className="hover:text-tw-primary">
            <X size={20} />
          </button>
        </div>
        <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
          <div>
            <label className="block mb-1 text-sm">Host</label>
            <input
              type="text"
              placeholder="localhost"
              required
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              value={host}
              onChange={(e) => setHost(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Port</label>
            <input
              type="number"
              placeholder="6379"
              required
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Username</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1 text-sm">Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 border rounded dark:border-tw-dark-border"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="pt-2 text-sm">
            <button
              disabled={!host || !port}
              type="submit"
              className="px-4 py-2 w-full bg-tw-primary text-white rounded hover:bg-tw-primary/90"
            >
              Apply Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditForm;
