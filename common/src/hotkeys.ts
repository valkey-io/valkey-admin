import type { NodeError } from "./node-results"
import type { AggregateReplyId } from "./reply-id"

export const isLfuPolicy = (policy?: string): boolean => policy?.includes("lfu") ?? false

export interface HotKeysRequestPayload {
  connectionId: string
  clusterId?: string
  count?: number
  lfuEnabled: boolean
  clusterSlotStatsEnabled: boolean
}

export type HotKeyEntry = [
  key: string,
  accessFrequency: number,
  sizeBytes: number | null,
  ttl: number,
  nodeId?: string,
  slotId?: number,
]

export interface HotKeysResponse {
  hotKeys: HotKeyEntry[]
  nodeId?: string
  lastCollectedAt?: number | null
  monitorRunning?: boolean
  checkAt?: number | null
}

export type HotKeysFulfilledPayload = AggregateReplyId & {
  parsedResponse: HotKeysResponse
  nodeErrors?: NodeError[]
}

export interface HotKeysErrorPayload {
  nodeId: string
  clusterId?: string
  error: string
}
