import type { AggregateReplyId } from "./reply-id"

export interface BigKeysRequestPayload {
  connectionId: string
  clusterId?: string
  topN: number
  scanLimit: number
}

export interface BigKey {
  key: string
  sizeBytes: number
  type: string
  ttl: number
  freq: number | null
  nodeId?: string
}

export interface BigKeysNodeError {
  nodeId: string
  error: string
}

export interface BigKeysResponse {
  nodeId: string
  keys: BigKey[]
  scanned: number
  totalKeys: number
  scannedAt: number
}

export type BigKeysFulfilledPayload = AggregateReplyId & {
  parsedResponse: BigKeysResponse
  nodeErrors?: BigKeysNodeError[]
}

export interface BigKeysErrorPayload {
  nodeId: string
  clusterId?: string
  error: string
}
