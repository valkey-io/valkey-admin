import { Typography } from "../../ui/typography"
import { cn } from "@/lib/utils"
import { BinaryBadge } from "./binary-badge"

interface KeyDetailsStreamProps {
  selectedKey: string;
  selectedKeyInfo: {
    name: string;
    type: "stream";
    ttl: number;
    size: number;
    collectionSize?: number;
    elements: Array<{
      key: string;
      value: [string, string][];
    }>;
    binaryIndexes?: number[];
  };
  connectionId: string;
  readOnly: boolean;
}

/**
 * Shows a stream's entries and their fields; entries with binary data are badged.
 */
export default function KeyDetailsStream(
  { selectedKeyInfo }: KeyDetailsStreamProps,
) {
  return (
    <div className="flex flex-col w-full p-4 space-y-4">
      {selectedKeyInfo?.elements.map((entry, index: number) => (
        <div className="overflow-hidden" key={index}>
          <div className={cn("bg-muted/60 text-foreground py-2 px-4")}>
            <Typography variant="label">Entry ID: {entry.key}</Typography> 
            <Typography variant="bodySm">({new Date(Number(entry.key.split("-")[0])).toLocaleString()})</Typography>
            {selectedKeyInfo.binaryIndexes?.includes(index) && <BinaryBadge />}
          </div>
          <table className="table-auto w-full">
            <thead className={cn("bg-muted/50 text-foreground")}>
              <tr>
                <th className="w-1/2 py-3 px-4 text-left">
                  <Typography variant="label">Field</Typography>
                </th>
                <th className="w-1/2 py-3 px-4 text-left">
                  <Typography variant="label">Value</Typography>
                </th>
              </tr>
            </thead>
            <tbody>
              {entry.value.map(([field, value], fieldIndex: number) => (
                <tr key={fieldIndex}>
                  <td className={cn("py-3 px-4 border-b border-border text-foreground")}>
                    <Typography variant="code">{field}</Typography>
                  </td>
                  <td className={cn("py-3 px-4 border-b border-border text-foreground")}>
                    <Typography variant="code">{value}</Typography>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {selectedKeyInfo.elements.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          No entries in this stream
        </div>
      )}
    </div>
  )
}
