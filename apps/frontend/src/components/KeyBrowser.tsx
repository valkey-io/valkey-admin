import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import * as R from "ramda";
import {
  getKeysRequested,
  getKeyTypeRequested,
  deleteKeyRequested,
} from "@/state/valkey-features/keys/keyBrowserSlice";
import {
  selectKeys,
  selectLoading,
  selectError,
} from "@/state/valkey-features/keys/keyBrowserSelectors";
import { useAppDispatch } from "@/hooks/hooks";
import { useParams } from "react-router";
import { AppHeader } from "./ui/app-header";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { CustomTooltip } from "./ui/custom-tooltip";
import { convertTTL } from "@common/src/ttl-conversion";
import { formatBytes } from "@common/src/bytes-conversion";
import { calculateTotalMemoryUsage } from "@common/src/memory-usage-calculation";
import {
  Compass,
  RefreshCcw,
  Key,
  Hourglass,
  Database,
  Trash,
} from "lucide-react";
import { Button } from "./ui/button";
import DeleteModal from "./ui/delete-modal";

interface KeyInfo {
  name: string;
  type: string;
  ttl: number;
  size: number;
  collectionSize?: number;
  elements?: any;
}

interface ElementInfo {
  key: string;
  value: string;
}

export function KeyBrowser() {
  const { id } = useParams();
  const dispatch = useAppDispatch();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleDeleteModal = () => {
    setIsDeleteModalOpen(!isDeleteModalOpen);
  };

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
    if (R.isNotEmpty(keyInfo) && !keyInfo!.type) {
      dispatch(getKeyTypeRequested({ connectionId: id!, key: keyName }));
    }
  };

  const handleKeyDelete = (keyName: string) => {
    dispatch(deleteKeyRequested({ connectionId: id!, key: keyName }));
    setSelectedKey(null);
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
      <TooltipProvider>
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
                          {R.toUpper(keyInfo.type)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        {keyInfo.size && (
                          <CustomTooltip content="Size">
                            <span className="flex items-center justify-between gap-1 text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                              <Database
                                size={20}
                                className="text-white bg-tw-primary p-1 rounded-full"
                              />{" "}
                              {formatBytes(keyInfo.size)}
                            </span>
                          </CustomTooltip>
                        )}
                        {/* text-red-400 is a placehodler for now, will change to a custom tw color */}
                        <CustomTooltip content="TTL">
                          <span className="flex items-center justify-between gap-1 text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                            <Hourglass
                              size={20}
                              className="text-white bg-tw-primary p-1 rounded-full"
                            />{" "}
                            {convertTTL(keyInfo.ttl)}
                          </span>
                        </CustomTooltip>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Key Details */}
          <div className="w-1/2 pl-2">
            <div className="h-full dark:border-tw-dark-border border rounded overflow-hidden">
              {selectedKey && selectedKeyInfo ? (
                <div className="h-full p-4 text-sm font-light overflow-y-auto">
                  <div className="flex justify-between items-center mb-2 border-b pb-4 border-tw-dark-border">
                    <span className="font-semibold flex items-center gap-2">
                      <Key size={16} />
                      {selectedKey}
                    </span>
                    <div className="space-x-2 flex items-center relative">
                      <CustomTooltip content="TTL">
                        <span className="text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                          {convertTTL(selectedKeyInfo.ttl)}
                        </span>
                      </CustomTooltip>
                      <CustomTooltip content="Type">
                        <span className="text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                          {selectedKeyInfo.type}
                        </span>
                      </CustomTooltip>
                      <CustomTooltip content="Size">
                        <span className="text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                          {formatBytes(selectedKeyInfo.size)}
                        </span>
                      </CustomTooltip>
                      {selectedKeyInfo.collectionSize !== undefined && (
                        <CustomTooltip content="Collection size">
                          <span className="text-xs px-2 py-1 rounded-full border-2 border-tw-primary text-tw-primary dark:text-white">
                            {selectedKeyInfo.collectionSize.toLocaleString()}
                          </span>
                        </CustomTooltip>
                      )}
                      <CustomTooltip content="Delete">
                        <Button
                          onClick={handleDeleteModal}
                          variant={"destructiveGhost"}
                          className="mr-0.5"
                        >
                          <Trash />
                        </Button>
                      </CustomTooltip>
                    </div>
                  </div>
                  {isDeleteModalOpen && (
                    <DeleteModal
                      keyName={selectedKeyInfo.name}
                      onConfirm={() => handleKeyDelete(selectedKeyInfo.name)}
                      onCancel={handleDeleteModal}
                    />
                  )}
                  {/* TO DO: Refactor KeyBrowser and build smaller components */}
                  {/* Key Elements */}
                  <div className="flex items-center justify-center w-full p-4">
                    <table className="table-fixed w-full overflow-hidden">
                      <thead className="bg-tw-dark-border opacity-85 text-white">
                        <tr>
                          <th className="w-1/2 py-3 px-4 text-left font-semibold">
                            {selectedKeyInfo.type === "list"
                              ? "Index"
                              : "Field"}
                          </th>
                          <th className="w-1/2 py-3 px-4 text-left font-semibold">
                            {selectedKeyInfo.type === "list"
                              ? "Elements"
                              : "Value"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedKeyInfo.elements.map(
                          (element: ElementInfo, index: number) => (
                            <tr key={index}>
                              <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                                {selectedKeyInfo.type === "list"
                                  ? index
                                  : element.key}
                              </td>
                              <td className="py-3 px-4 border-b border-tw-dark-border font-light dark:text-white">
                                {selectedKeyInfo.type === "list"
                                  ? String(element)
                                  : element.value}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
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
      </TooltipProvider>
    </div>
  );
}
