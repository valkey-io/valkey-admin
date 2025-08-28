import { useAppDispatch } from "@/hooks/hooks";
import { X } from "lucide-react";

type ConnectionFormProps = {
  onClose: () => void;
};

import { setConnecting as valkeySetConnecting } from "@/state/valkey-features/connection/connectionSlice.ts";
import { useState } from "react";

function ConnectionForm({ onClose }: ConnectionFormProps) {
  const dispatch = useAppDispatch();
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("6379");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(
      valkeySetConnecting({ status: true, host, port, username, password })
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-lg border">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Connection Form</h2>
          <button onClick={onClose} className="hover:text-tw-primary">
            <X size={20} />
          </button>
        </div>
        <span className="text-sm font-light">
          Enter your server's host and port to connect.
        </span>
        <form className="space-y-4 mt-4" onSubmit={handleSubmit}>
          <div>
            <label className="block mb-1 text-sm">Host</label>
            <input
              type="text"
              placeholder="localhost"
              required
              className="w-full px-3 py-2 border rounded"
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
              className="w-full px-3 py-2 border rounded"
              value={port}
              onChange={(e) => setPort(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm">Username</label>
            <input
              type="text"
              className="w-full px-3 py-2 border rounded"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block mb-1 text-sm">Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 border rounded"
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
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ConnectionForm;
