import { Typography } from "../../ui/typography"
import { Badge } from "../../ui/badge"
import { CustomTooltip } from "../../ui/tooltip"
import { cn } from "@/lib/utils"

export interface StreamFieldPair {
  field: string;
  value: string;
  isFieldBinary?: boolean;
  isValueBinary?: boolean;
  isBinary?: boolean;
}

interface KeyDetailsStreamProps {
  selectedKey: string;
  selectedKeyInfo: {
    name: string;
    type: "stream";
    ttl: number;
    size: number;
    collectionSize?: number;
    elements: Array<
      | [string, Array<[string, string] | StreamFieldPair>]
      | {
        key: string;
        value: Array<[string, string] | StreamFieldPair>;
      }
    >;
  };
  connectionId: string;
  readOnly: boolean;
}

export default function KeyDetailsStream(
  { selectedKeyInfo }: KeyDetailsStreamProps,
) {
  const entries: Array<{ key: string; value: StreamFieldPair[] }> = (selectedKeyInfo?.elements || []).map((entry: unknown) => {
    if (Array.isArray(entry)) {
      const key = String(entry[0])
      const rawFields = entry[1]
      const value: StreamFieldPair[] = []
      if (Array.isArray(rawFields)) {
        for (const item of rawFields) {
          if (Array.isArray(item)) {
            value.push({ field: String(item[0]), value: String(item[1]) })
          } else if (item && typeof item === "object") {
            const pair = item as StreamFieldPair
            value.push({
              field: String(pair.field),
              value: String(pair.value),
              isFieldBinary: pair.isFieldBinary,
              isValueBinary: pair.isValueBinary,
              isBinary: pair.isBinary,
            })
          }
        }
      }
      return { key, value }
    }
    const objEntry = entry as { key: string; value: Array<[string, string] | StreamFieldPair> }
    const value: StreamFieldPair[] = (objEntry.value || []).map((item) => {
      if (Array.isArray(item)) {
        return { field: String(item[0]), value: String(item[1]) }
      }
      return item as StreamFieldPair
    })
    return { key: String(objEntry.key), value }
  })

  return (
    <div className="flex flex-col w-full p-4 space-y-4">
      {entries.map((entry, index: number) => (
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
              {entry.value.map((pair, fieldIndex: number) => (
                <tr key={fieldIndex}>
                  <td className={cn("py-3 px-4 border-b border-border text-foreground")}>
                    <div className="flex items-center gap-2">
                      <Typography className="whitespace-pre-wrap break-words" variant="code">{pair.field}</Typography>
                      {pair.isFieldBinary && (
                        <CustomTooltip content="Binary fields can't be edited as text">
                          <Badge className="text-[10px] px-1 py-0" variant="secondary">binary</Badge>
                        </CustomTooltip>
                      )}
                    </div>
                  </td>
                  <td className={cn("py-3 px-4 border-b border-border text-foreground")}>
                    <div className="flex items-center gap-2">
                      <Typography className="whitespace-pre-wrap break-words" variant="code">{pair.value}</Typography>
                      {pair.isValueBinary && (
                        <CustomTooltip content="Binary values can't be edited as text">
                          <Badge className="text-[10px] px-1 py-0" variant="secondary">binary</Badge>
                        </CustomTooltip>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {entries.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          No entries in this stream
        </div>
      )}
    </div>
  )
}
