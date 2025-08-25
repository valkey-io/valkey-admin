import { useState, useEffect } from "react";
import {
  setRedirected,
  setConnecting as valkeySetConnecting,
} from "@/state/valkey-features/connection/connectionSlice.ts";
import {
  selectConnected,
  selectRedirected,
} from "@/state/valkey-features/connection/connectionSelectors.ts";
import { useAppDispatch } from "../hooks/hooks";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router";
import { selectData } from "@/state/valkey-features/info/infoSelectors.ts";

export function Connection() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("6379");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showConnectionForm, setShowConnectionForm] = useState(false);

  const { server_name, tcp_port } = useSelector(selectData);

  const isConnected = useSelector(selectConnected);
  const hasRedirected = useSelector(selectRedirected);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(
      valkeySetConnecting({ status: true, host, port, username, password })
    );
  };

  useEffect(() => {
    if (isConnected && !hasRedirected) {
      dispatch(setRedirected(true));
      setShowConnectionForm(false);
    }
  }, [isConnected, navigate, hasRedirected, dispatch]);

  return (
    <div className="p-4 relative">
      {/* top header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-700">Connections</h1>
        <button
          onClick={() => setShowConnectionForm(!showConnectionForm)}
          className="bg-tw-primary text-white px-2 rounded text-sm font-light py-1 cursor-pointer"
        >
          + Add Connection
        </button>
      </div>
      {showConnectionForm && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4">
          <Card className="m-auto min-w-[30rem] shadow-lg">
            <CardHeader>
              <CardTitle>Connect to Valkey</CardTitle>
              <CardDescription>
                Enter your server's host and port to connect.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-6">
                  <div className="grid gap-2">
                    <Label htmlFor="host">Host</Label>
                    <Input
                      id="host"
                      type="text"
                      value={host}
                      placeholder="localhost"
                      required
                      onChange={(e) => setHost(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="port">Port</Label>
                    <Input
                      id="port"
                      type="number"
                      value={port}
                      placeholder="6379"
                      required
                      onChange={(e) => setPort(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center">
                      <Label htmlFor="username">Username</Label>
                    </div>
                    <Input
                      id="username"
                      type="username"
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex items-center">
                      <Label htmlFor="password">Password</Label>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-2 mt-8">
                  <Button type="submit" className="w-full">
                    Connect
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
      {/* Connected DBs */}
      <div className="border-t-1 mt-8">
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
            </tr>
          </thead>
          <tbody className="font-light hover:bg-gray-50">
            {isConnected ? (
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
              </tr>
            ) : (
              "No Connections!"
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
