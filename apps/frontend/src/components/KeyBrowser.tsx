import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import {
  getKeysRequested,
  getKeyTypeRequested,
} from "@/state/valkey-features/keys/keyBrowserSlice";
import {
  selectKeys,
  selectLoading,
  selectError,
} from "@/state/valkey-features/keys/keyBrowserSelectors";
import { useAppDispatch } from "@/hooks/hooks";
import { useParams } from "react-router";
import { AppHeader } from "./ui/app-header";
import { convertTTL } from "@common/src/ttl-conversion";
import { formatBytes } from "@common/src/bytes-conversion";
import { calculateTotalMemoryUsage } from "@common/src/memoryUsage-claculation";
import { Compass, RefreshCcw, Key } from "lucide-react";
import { toUpper } from "ramda";

interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
}

export function KeyBrowser() {
  const { id } = useParams();
  const dispatch = useAppDispatch();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const keys: KeyInfo[] = useSelector(selectKeys(id!));
  const loading = useSelector(selectLoading(id!));
  const error = useSelector(selectError(id!));

  useEffect(() => {
    if (id) {
      dispatch(getKeysRequested({ connectionId: id! }));
    }
  }, [id, dispatch]);

  const handleRefresh = () => {
    dispatch(getKeysRequested({ connectionId: id! }));
  };

  const handleKeyClick = (keyName: string) => {
    setSelectedKey(keyName);

    const keyInfo = keys.find((k) => k.name === keyName);
    if (keyInfo && !keyInfo.type) {
      dispatch(getKeyTypeRequested({ connectionId: id!, key: keyName }));
    }
  };

  // Get selected key info from the keys data
  const selectedKeyInfo = selectedKey
    ? keys.find((k) => k.name === selectedKey)
    : null;

  // Calculate total memory usage
  const totalMemoryUsage = calculateTotalMemoryUsage(keys);

  return (
    <div className="flex flex-col h-screen p-4">
      <AppHeader title="Key Browser" icon={<Compass size={20} />} />

      {loading && <div className="ml-2">Loading keys...</div>}
      {error && <div className="ml-2">Error loading keys: {error}</div>}

      {/* Total Keys and Key Stats */}
      <div className="flex justify-between mb-8">
        <div className="h-20 w-1/4 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
          <span className="text-2xl font-semibold">{keys.length}</span>
          <span className="font-light text-sm">Total Keys</span>
        </div>
        <div className="h-20 w-1/4 p-4 dark:border-tw-dark-border border rounded flex flex-col justify-center items-center">
          <span className="text-2xl font-semibold">
            {formatBytes(totalMemoryUsage)}
          </span>
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
      <div className="flex items-center w-full mb-4">
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

      {/* Key Viewer */}
      <div className="flex flex-1 min-h-0">
        {/* Keys List */}
        <div className="w-1/2 pr-2">
          {keys.length === 0 ? (
            <div className="h-full p-2 dark:border-tw-dark-border border rounded flex items-center justify-center">
              No keys found
            </div>
          ) : (
            <div className="h-full dark:border-tw-dark-border border rounded overflow-hidden">
              <ul className="h-full overflow-y-auto space-y-2 p-2">
                {keys.map((keyInfo: KeyInfo, index) => (
                  <li
                    key={index}
                    className="h-16 p-2 dark:border-tw-dark-border border hover:text-tw-primary cursor-pointer rounded flex items-center gap-2 justify-between"
                    onClick={() => handleKeyClick(keyInfo.name)}
                  >
                    <div className=" items-center gap-2">
                      <span className="flex items-center gap-2">
                        <Key size={16} /> {keyInfo.name}
                      </span>
                      <div className="ml-6 text-xs font-light text-tw-primary">
                        {toUpper(keyInfo.type)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      {keyInfo.size && (
                        <span className="bg-tw-accent text-xs px-2 py-1 text-tw-primary rounded-full">
                          {formatBytes(keyInfo.size)}
                        </span>
                      )}
                      {/* text-red-400 is a placehodler for now, will change to a custom tw color */}
                      <span className="bg-tw-accent2 text-xs px-2 py-1 text-red-400 rounded-full">
                        {convertTTL(keyInfo.ttl)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Key Details */}
        <div className="w-1/2 pl-2">
          <div className="h-full dark:border-tw-dark-border border rounded">
            {selectedKey && selectedKeyInfo ? (
              <div className="p-4 text-sm font-light overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <span className="font-semibold flex items-center gap-2">
                    <Key size={16} />
                    {selectedKey}
                  </span>
                  <div className="space-x-2">
                    <span className="bg-tw-accent2 text-xs px-2 py-1 text-red-400 rounded-full">
                      {convertTTL(selectedKeyInfo.ttl)}
                    </span>
                    <span className="bg-tw-accent text-xs px-2 py-1 rounded-full">
                      {selectedKeyInfo.type}
                    </span>
                    <span className="bg-tw-accent text-xs px-2 py-1 rounded-full">
                      {formatBytes(selectedKeyInfo.size)}
                    </span>
                    {selectedKeyInfo.collectionSize !== undefined && (
                      <span className="bg-tw-accent text-xs px-2 py-1 rounded-full">
                        {selectedKeyInfo.collectionSize.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full p-4 text-sm font-light flex items-center justify-center text-gray-500">
                Select a key to see details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
