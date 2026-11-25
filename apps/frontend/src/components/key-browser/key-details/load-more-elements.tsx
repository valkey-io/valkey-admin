import { Loader2 } from "lucide-react"
import { Button } from "../../ui/button"
import { Typography } from "../../ui/typography"
import { useAppDispatch, useAppSelector } from "@/hooks/hooks"
import { getKeyElementsRequested } from "@/state/valkey-features/keys/keyBrowserSlice"
import { selectElementsLoadingForKey } from "@/state/valkey-features/keys/keyBrowserSelectors"

interface LoadMoreElementsProps {
  connectionId: string;
  keyInfo: {
    name: string;
    type: string;
    cursor?: string;
    collectionSize?: number;
    elements: unknown[];
  };
}

export default function LoadMoreElements({ connectionId, keyInfo }: LoadMoreElementsProps) {
  const dispatch = useAppDispatch()
  const loading = useAppSelector(selectElementsLoadingForKey(connectionId, keyInfo.name))
  const { name, type, cursor, collectionSize, elements } = keyInfo

  return (
    <div className="flex items-center justify-between py-3 px-4">
      <Typography variant="bodySm">
        Showing {elements.length.toLocaleString()}
        {collectionSize !== undefined && ` of ${collectionSize.toLocaleString()}`}
      </Typography>
      {cursor !== undefined && (
        <Button
          disabled={loading}
          onClick={() => dispatch(getKeyElementsRequested({ connectionId, key: name, keyType: type, cursor }))}
          size="sm"
          variant="outline"
        >
          {loading && <Loader2 className="animate-spin" />}
          Load more
        </Button>
      )}
    </div>
  )
}
