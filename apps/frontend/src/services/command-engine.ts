/**
 * Command Engine — frontend client for the backend intent detector.
 *
 * Natural language is sent to /api/ai-copilot/interpret, which uses Gemini
 * (when GEMINI_API_KEY is configured) or a deterministic local classifier.
 * The backend never silently falls back to a generic INFO command — when it
 * can't determine intent it returns UNKNOWN with debug details.
 */

export interface CommandResult {
  query: string
  intent: string
  confidence: number
  generatedCommand: string
  explanation: string
  isSafe: boolean
  // ── Debug fields ──
  source: "groq" | "local" | "blocked"
  rawResponse: string | null
  parseError: string | null
}

interface InterpretResponse extends CommandResult {
  ok: boolean
  error?: string
}

/**
 * Send a natural-language query to the backend intent detector.
 */
export async function interpretQuery(input: string): Promise<CommandResult> {
  const query = input.trim()

  const response = await fetch("/api/ai-copilot/interpret", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  })

  const data: InterpretResponse = await response.json()

  if (!data.ok) {
    throw new Error(data.error || "Intent detection failed")
  }

  return {
    query: data.query,
    intent: data.intent,
    confidence: data.confidence,
    generatedCommand: data.generatedCommand,
    explanation: data.explanation,
    isSafe: data.isSafe,
    source: data.source,
    rawResponse: data.rawResponse,
    parseError: data.parseError,
  }
}

/**
 * Suggested queries for the input field.
 */
export function getSuggestions(): string[] {
  return [
    "Show top memory consuming keys",
    "Which keys use the most memory?",
    "Find keys without TTL",
    "Show active clients",
    "Explain cache performance",
    "Show database statistics",
    "Show slow queries",
    "What is the replication status?",
  ]
}
