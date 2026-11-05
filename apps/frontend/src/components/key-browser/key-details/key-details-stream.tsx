import { Typography } from "../../ui/typography"
import { cn } from "@/lib/utils"

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
    isBinary?: boolean;
  };
  connectionId: string;
  readOnly: boolean;
}

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
              {entry.value.map(([field, value], fieldIndex: number) => {
                const isFieldBinary = /\\x[0-9a-fA-F]{2}/.test(field)
                const isValueBinary = /\\x[0-9a-fA-F]{2}/.test(value)
                return (
                  <tr key={fieldIndex}>
                    <td className={cn("py-3 px-4 border-b border-border text-foreground")}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Typography className="truncate" variant="code">{field}</Typography>
                        {isFieldBinary && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded uppercase">binary</span>
                        )}
                      </div>
                    </td>
                    <td className={cn("py-3 px-4 border-b border-border text-foreground")}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Typography className="truncate" variant="code">{value}</Typography>
                        {isValueBinary && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded uppercase">binary</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
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
