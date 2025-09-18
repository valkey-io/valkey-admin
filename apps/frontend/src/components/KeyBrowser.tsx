import { useEffect } from "react";
import { useSelector } from "react-redux";
import { getKeysRequested } from "@/state/valkey-features/keys/keyBrowserSlice";
import {
  selectKeys,
  selectLoading,
  selectError,
} from "@/state/valkey-features/keys/keyBrowserSelectors";
import { useAppDispatch } from "@/hooks/hooks";
import { useParams } from "react-router";
import { AppHeader } from "./ui/app-header";
import { Compass, RefreshCcw } from "lucide-react";

export function KeyBrowser() {
  const { id } = useParams();
  const dispatch = useAppDispatch();

  const keys = useSelector(selectKeys(id!))
  const loading = useSelector(selectLoading(id!));
  const error = useSelector(selectError(id!));

  useEffect(() => {
    if (id) {
      dispatch(getKeysRequested({ connectionId: id!}));
    }
  }, [id, dispatch]);

  const handleRefresh = () => {
    dispatch(getKeysRequested({ connectionId: id!}));
  };

  return (
    <div className="p-4">
      <AppHeader title="Key Browser" icon={<Compass size={20} />} />

      {loading && <div className="ml-2">Loading keys...</div>}
      {error && <div className="ml-2">Error loading keys: {error}</div>}

      {/* Total Keys and Key Stats */}
      <div className="flex justify-between">
        <div className="h-20 w-1/4 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
          <span className="text-2xl font-semibold">{keys.length}</span>
          <span className="font-light text-sm">Total Keys</span>
        </div>
        <div className="h-20 w-1/4 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
          <span className="text-2xl font-semibold">TBD</span>
          <span className="font-light text-sm">Memory Usage</span>
        </div>
        <div className="h-20 w-1/4 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
          <span className="text-2xl font-semibold">TBD</span>
          <span className="font-light text-sm">Operations</span>
        </div>
        <div className="h-20 w-1/5 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
          <span className="text-2xl font-semibold">TBD</span>
          <span className="font-light text-sm">Hit Rate</span>
        </div>
      </div>
      {/* Search and Refresh */}
      <div className="mt-8 flex items-center w-full">
        <input
          placeholder="search"
          className="w-full h-10 p-2 dark:border-tw-dark-border border rounded"
        />
        <button
          onClick={handleRefresh}
          className="ml-2 px-4 py-2 bg-tw-primary text-white rounded"
        >
          <RefreshCcw />
        </button>
      </div>
      {/* Keys & Key Viewer*/}
      <div className="mt-4 flex items-center justify-between">
        {/* Keys */}
        <div className="w-1/2">
          {keys.length === 0 ? (
            <div className="h-10 p-2 dark:border-tw-dark-border border rounded">
              No keys found
            </div>
          ) : (
            <ul className="space-y-2">
              {keys.map((keyInfo: { key: string }, index) => (
                <li
                  key={index}
                  className="h-10 p-2 dark:border-tw-dark-border border rounded"
                >
                  {keyInfo.key}
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Key Viewer */}
        <div className="w-1/2 p-2 text-sm font-light rounded flex items-center justify-center">Select a key to see details </div>
      </div>
    </div>
  );
}
