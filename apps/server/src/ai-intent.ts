/**
 * AI Intent Detection for "Ask Valkey".
 *
 * Converts a natural-language query into a structured intent, then maps that
 * intent to a safe, read-only Valkey command.
 *
 * Two detection paths:
 *   1. Gemini (when GEMINI_API_KEY is set) — strict JSON output, validated.
 *   2. Local keyword classifier — deterministic fallback, always available.
 *
 * The result always carries debug fields so the UI can show exactly what
 * happened. We never silently fall back to a generic INFO command.
 */

// ─── Intent catalog ───────────────────────────────────────────────────────────

export const INTENTS = {
  TOP_MEMORY_KEYS: {
    command: "MEMORY DOCTOR",
    explanation: "Runs memory diagnostics to surface large-key and fragmentation issues.",
  },
  MEMORY_USAGE: {
    command: "INFO memory",
    explanation: "Shows memory usage: used, peak, fragmentation ratio, and allocator stats.",
  },
  KEYS_WITHOUT_TTL: {
    command: "SCAN 0 COUNT 100",
    explanation: "Scans keys incrementally. For each, TTL <key> returning -1 means no expiry is set.",
  },
  KEY_COUNT: {
    command: "DBSIZE",
    explanation: "Returns the total number of keys in the current database.",
  },
  ACTIVE_CLIENTS: {
    command: "CLIENT LIST",
    explanation: "Lists connected clients with address, age, idle time, and current command.",
  },
  CACHE_PERFORMANCE: {
    command: "INFO stats",
    explanation: "Shows keyspace_hits and keyspace_misses. Hit ratio = hits / (hits + misses); target ≥ 80%.",
  },
  DATABASE_STATS: {
    command: "INFO",
    explanation: "Comprehensive server info: memory, CPU, clients, persistence, and keyspace stats.",
  },
  SLOW_QUERIES: {
    command: "SLOWLOG GET 10",
    explanation: "Returns the 10 most recent slow commands above the slowlog threshold.",
  },
  REPLICATION_STATUS: {
    command: "INFO replication",
    explanation: "Shows replication role, connected replicas, and replication offset.",
  },
  PERSISTENCE_STATUS: {
    command: "INFO persistence",
    explanation: "Shows RDB/AOF status: last save time and changes since last dump.",
  },
  SERVER_UPTIME: {
    command: "INFO server",
    explanation: "Shows server uptime, version, mode, and process id.",
  },
} as const

export type IntentName = keyof typeof INTENTS

export interface IntentResult {
  query: string
  intent: IntentName | "UNKNOWN"
  confidence: number
  explanation: string
  generatedCommand: string
  isSafe: boolean
  // ── Debug fields ──
  source: "groq" | "local" | "blocked"
  rawResponse: string | null
  parseError: string | null
}

// ─── Safety layer ───────────────────────────────────────────────────────────

const DESTRUCTIVE = /\b(delete|del|remove|flush(all|db)?|drop|destroy|wipe|shutdown|config\s+set|rename|migrate|restore|swapdb)\b/i

function destructiveResult(query: string): IntentResult {
  return {
    query,
    intent: "UNKNOWN",
    confidence: 1,
    explanation: "Destructive operations are blocked in AI Copilot. Use the Send Command page with caution.",
    generatedCommand: "",
    isSafe: false,
    source: "blocked",
    rawResponse: null,
    parseError: null,
  }
}

// ─── Local keyword classifier (deterministic fallback) ────────────────────────

const KEYWORDS: Record<IntentName, RegExp[]> = {
  TOP_MEMORY_KEYS: [/top\s*memory/i, /largest\s*key/i, /big(gest)?\s*key/i, /most\s*memory/i, /memory[-\s]*consum/i, /heaviest\s*key/i],
  MEMORY_USAGE: [/memory\s*(usage|stats|info|consumption)/i, /how\s*much\s*memory/i, /ram\s*usage/i, /used\s*memory/i],
  KEYS_WITHOUT_TTL: [/without\s*ttl/i, /no\s*ttl/i, /missing\s*ttl/i, /never\s*expir/i, /not?\s*expir/i, /persistent\s*key/i],
  KEY_COUNT: [/how\s*many\s*keys/i, /key\s*count/i, /number\s*of\s*keys/i, /total\s*keys/i, /dbsize/i],
  ACTIVE_CLIENTS: [/active\s*client/i, /connected\s*client/i, /show\s*client/i, /list\s*client/i, /who.*connected/i, /current\s*connection/i],
  CACHE_PERFORMANCE: [/cache\s*(perf|hit|miss|ratio|effic)/i, /hit\s*ratio/i, /explain.*cache/i, /cache\s*performance/i],
  DATABASE_STATS: [/database\s*stat/i, /db\s*stat/i, /server\s*stat/i, /overview/i, /general\s*info/i, /show.*stats/i],
  SLOW_QUERIES: [/slow\s*(log|quer|command)/i, /slowest/i, /laggy\s*command/i],
  REPLICATION_STATUS: [/replicat/i, /replica/i, /\bslave\b/i, /\bmaster\b/i],
  PERSISTENCE_STATUS: [/persist/i, /\brdb\b/i, /\baof\b/i, /backup/i, /snapshot/i],
  SERVER_UPTIME: [/uptime/i, /how\s*long.*running/i, /server\s*version/i],
}

function classifyLocally(query: string): { intent: IntentName | "UNKNOWN"; confidence: number } {
  const scores: { intent: IntentName; score: number }[] = []
  for (const [intent, patterns] of Object.entries(KEYWORDS) as [IntentName, RegExp[]][]) {
    let score = 0
    for (const re of patterns) if (re.test(query)) score++
    if (score > 0) scores.push({ intent, score })
  }
  if (scores.length === 0) return { intent: "UNKNOWN", confidence: 0 }
  scores.sort((a, b) => b.score - a.score)
  // Confidence: more matched patterns = higher confidence, capped.
  const confidence = Math.min(0.6 + scores[0].score * 0.15, 0.95)
  return { intent: scores[0].intent, confidence }
}

// ─── Groq path (OpenAI-compatible) ────────────────────────────────────────────

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b"
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

function buildPrompt(query: string): string {
  const intentList = Object.keys(INTENTS).join(", ")
  return [
    "You are an intent classifier for a Valkey (Redis-compatible) database admin tool.",
    `Classify the user's request into EXACTLY ONE of these intents: ${intentList}.`,
    'If none fit, use "UNKNOWN".',
    "",
    "Respond with STRICT JSON ONLY. No markdown, no code fences, no prose.",
    "Schema:",
    '{ "intent": "<INTENT_NAME>", "confidence": <number 0..1>, "explanation": "<one sentence>" }',
    "",
    `User request: "${query}"`,
  ].join("\n")
}

interface LlmParsed {
  intent: string
  confidence: number
  explanation: string
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const brace = candidate.match(/\{[\s\S]*\}/)
  return (brace ? brace[0] : candidate).trim()
}

async function classifyWithGroq(
  query: string,
  apiKey: string,
): Promise<{ parsed: LlmParsed | null; raw: string; parseError: string | null }> {
  const body = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: "You output strict JSON only, matching the requested schema." },
      { role: "user", content: buildPrompt(query) },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  }

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const raw = await response.text()
  if (!response.ok) {
    return { parsed: null, raw, parseError: `Groq HTTP ${response.status}` }
  }

  // Unwrap the OpenAI-compatible envelope → choices[0].message.content
  let modelText = raw
  try {
    const envelope = JSON.parse(raw) as {
      choices?: { message?: { content?: string } }[]
    }
    modelText = envelope.choices?.[0]?.message?.content ?? raw
  } catch {
    // raw wasn't the expected envelope; fall through with raw text
  }

  try {
    const parsed = JSON.parse(extractJson(modelText)) as LlmParsed
    if (typeof parsed.intent !== "string") {
      return { parsed: null, raw: modelText, parseError: "Missing 'intent' field in LLM JSON" }
    }
    return { parsed, raw: modelText, parseError: null }
  } catch (err) {
    return { parsed: null, raw: modelText, parseError: err instanceof Error ? err.message : "JSON parse failed" }
  }
}

// ─── Public entry ─────────────────────────────────────────────────────────────

/**
 * Returns the configured model name (for health/debug output).
 */
export function getModel(): string {
  return GROQ_MODEL
}

/**
 * Health check: is GROQ_API_KEY configured, and is the API reachable?
 * Never returns or logs the key itself.
 */
export async function llmHealth(): Promise<{
  configured: boolean
  reachable: boolean
  model: string
  status?: number
  error?: string
}> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return { configured: false, reachable: false, model: GROQ_MODEL, error: "GROQ_API_KEY not set" }
  }
  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: 'Reply with valid json {"ok":true} only.' }],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    })
    if (!response.ok) {
      const body = await response.text()
      return { configured: true, reachable: false, model: GROQ_MODEL, status: response.status, error: body.slice(0, 300) }
    }
    return { configured: true, reachable: true, model: GROQ_MODEL, status: response.status }
  } catch (err) {
    return { configured: true, reachable: false, model: GROQ_MODEL, error: err instanceof Error ? err.message : "request failed" }
  }
}

export async function detectIntent(query: string): Promise<IntentResult> {
  const trimmed = query.trim()

  if (DESTRUCTIVE.test(trimmed)) {
    return destructiveResult(trimmed)
  }

  const apiKey = process.env.GROQ_API_KEY
  let rawResponse: string | null = null
  let parseError: string | null = null

  // 1. Try Groq if configured.
  if (apiKey) {
    try {
      const { parsed, raw, parseError: pErr } = await classifyWithGroq(trimmed, apiKey)
      rawResponse = raw
      parseError = pErr

      if (parsed && parsed.intent in INTENTS) {
        const intent = parsed.intent as IntentName
        const meta = INTENTS[intent]
        return {
          query: trimmed,
          intent,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.9,
          explanation: parsed.explanation || meta.explanation,
          generatedCommand: meta.command,
          isSafe: true,
          source: "groq",
          rawResponse,
          parseError: null,
        }
      }
      if (parsed && parsed.intent === "UNKNOWN") {
        // Model explicitly said unknown — fall through to local, but keep raw.
        parseError = parseError ?? "LLM returned UNKNOWN"
      }
    } catch (err) {
      parseError = err instanceof Error ? err.message : "Groq request failed"
    }
  } else {
    parseError = "GROQ_API_KEY not configured — using local classifier"
  }

  // 2. Deterministic local classifier.
  const { intent, confidence } = classifyLocally(trimmed)
  if (intent !== "UNKNOWN") {
    const meta = INTENTS[intent]
    return {
      query: trimmed,
      intent,
      confidence,
      explanation: meta.explanation,
      generatedCommand: meta.command,
      isSafe: true,
      source: "local",
      rawResponse,
      parseError,
    }
  }

  // 3. True unknown — DO NOT silently run INFO. Report it.
  return {
    query: trimmed,
    intent: "UNKNOWN",
    confidence: 0,
    explanation: "Could not determine intent. Try: 'show top memory keys', 'find keys without TTL', 'show active clients', or 'explain cache performance'.",
    generatedCommand: "",
    isSafe: true,
    source: rawResponse ? "groq" : "local",
    rawResponse,
    parseError,
  }
}
