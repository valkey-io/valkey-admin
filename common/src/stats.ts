export interface StatsRequestPayload {
  connectionId: string
}

export interface StatsDataPayload {
  connectionId: string
  info: Record<string, unknown>
  memory: Record<string, unknown>
}

export interface StatsErrorPayload {
  connectionId: string
  error: string
  errorKind?: string
}
