/**
 * Breeth Service — frontend client for the AI Copilot backend endpoints.
 *
 * All Breeth API calls go through the Valkey Admin backend at /api/ai-copilot/*.
 * The API key is stored server-side only.
 *
 * Architecture:
 *   Browser → /api/ai-copilot/* → Backend → https://api.thebreeth.com/v1/*
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AnalysisRecord {
  timestamp: string
  healthScore: number
  rootCause: string
  riskAssessment: string
  issues: string[]
  recommendations: string[]
  optimizations: string[]
  metricsSnapshot: Record<string, unknown>
  query?: string
}

export interface BreethEdge {
  edge_uuid: string
  source_node: string
  target_node: string
  fact: string
  name: string
  intent_meta?: {
    edge_kind?: string
    cognitive_pattern?: string
    why_connected?: string
  }
}

interface SaveResponse {
  ok: boolean
  episode_name?: string
  extracted?: { entities: number; edges: number }
  error?: string
}

interface SearchResponse {
  ok: boolean
  edges: BreethEdge[]
  error?: string
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Save a health analysis to Breeth via the backend.
 */
export async function saveAnalysis(record: AnalysisRecord): Promise<SaveResponse> {
  const response = await fetch("/api/ai-copilot/save-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  })

  const data: SaveResponse = await response.json()
  if (!data.ok) {
    throw new Error(data.error || "Failed to save analysis")
  }
  return data
}

/**
 * Retrieve analysis history from Breeth via the backend.
 */
export async function retrieveAnalyses(): Promise<BreethEdge[]> {
  const response = await fetch("/api/ai-copilot/history")
  const data: SearchResponse = await response.json()
  if (!data.ok) {
    throw new Error(data.error || "Failed to load history")
  }
  return data.edges
}

/**
 * Search for similar incidents via the backend.
 */
export async function searchSimilarAnalyses(query: string, limit = 5): Promise<BreethEdge[]> {
  const response = await fetch("/api/ai-copilot/search-similar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  })

  const data: SearchResponse = await response.json()
  if (!data.ok) {
    throw new Error(data.error || "Failed to search similar incidents")
  }
  return data.edges
}

/**
 * Save a natural language command interaction via the backend.
 */
export async function saveCommandInteraction(
  question: string,
  generatedCommand: string,
  result: string,
): Promise<SaveResponse> {
  const record: AnalysisRecord = {
    timestamp: new Date().toISOString(),
    healthScore: 0,
    rootCause: "",
    riskAssessment: "",
    issues: [],
    recommendations: [],
    optimizations: [],
    metricsSnapshot: {},
    query: `User asked: "${question}". Generated: ${generatedCommand}. Result: ${result.slice(0, 300)}`,
  }

  return saveAnalysis(record)
}
