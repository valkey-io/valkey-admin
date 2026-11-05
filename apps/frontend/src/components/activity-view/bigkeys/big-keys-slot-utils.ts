import { getKeySlot } from "@common/src/cluster-slots"
import type { BigKey } from "@/state/valkey-features/bigkeys/bigKeysSlice"

export interface BigKeySlotGroup {
  slotId: number
  keys: BigKey[]
  totalBytes: number
  nodeId?: string
}

export const groupBigKeysBySlot = (keys: BigKey[]): BigKeySlotGroup[] => {
  const grouped = new Map<number, BigKeySlotGroup>()

  for (const item of keys) {
    const slotId = item.slotId ?? getKeySlot(item.key)
    const group = grouped.get(slotId) ?? {
      slotId,
      keys: [],
      totalBytes: 0,
      nodeId: item.nodeId,
    }
    group.keys.push(item)
    group.totalBytes += item.sizeBytes
    grouped.set(slotId, group)
  }

  return [...grouped.values()].sort(
    (a, b) => b.keys.length - a.keys.length || b.totalBytes - a.totalBytes,
  )
}
