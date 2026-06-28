import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useParams } from "react-router"
import {
  BrainCircuit, Activity, Heart, AlertTriangle, CheckCircle,
  Clock, Search, Save, Loader2, Terminal, Shield, TrendingUp,
  Zap, MessageSquare, Lightbulb
} from "lucide-react"
import { formatBytes } from "@common/src/bytes-conversion"
import { calculateHitRatio } from "@common/src/cache-hit-ratio"
import { AppHeader } from "../ui/app-header"
import RouteContainer from "../ui/route-container"
import { ParticleWave } from "../ui/particle-wave"
import { selectData } from "@/state/valkey-features/info/infoSelectors"
import { useAppDispatch } from "@/hooks/hooks"
import { updateData } from "@/state/valkey-features/info/infoSlice"
import { selectConnectionDetails } from "@/state/valkey-features/connection/connectionSelectors"
import { analyzeDatabase, type AnalysisResult } from "@/services/analysis-engine"
import { interpretQuery, getSuggestions, type CommandResult } from "@/services/command-engine"
import {
  saveAnalysis, retrieveAnalyses, searchSimilarAnalyses,
  saveCommandInteraction, type BreethEdge, type AnalysisRecord,
} from "@/services/breeth"

export function AICopilot() {
  const dispatch = useAppDispatch()
  const { id, clusterId } = useParams()
  const connectionDetails = useSelector(selectConnectionDetails(id!))
  const infoData = (useSelector(selectData(id!)) || {}) as unknown as Record<string, unknown>

  // Analysis state
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Command state
  const [commandInput, setCommandInput] = useState("")
  const [commandResult, setCommandResult] = useState<CommandResult | null>(null)
  const [isInterpreting, setIsInterpreting] = useState(false)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  // Breeth memory state
  const [breethMemories, setBreethMemories] = useState<BreethEdge[]>([])
  const [similarIncidents, setSimilarIncidents] = useState<BreethEdge[]>([])
  const [isLoadingMemories, setIsLoadingMemories] = useState(false)
  const [isSearchingSimilar, setIsSearchingSimilar] = useState(false)
  const [breethError, setBreethError] = useState<string | null>(null)

  // Fetch metrics
  useEffect(() => {
    dispatch(updateData({
      connectionId: id!,
      clusterId: clusterId ?? "",
      address: { host: connectionDetails.host, port: connectionDetails.port },
    }))
  }, [id, clusterId, dispatch, connectionDetails.host, connectionDetails.port])

  // Load Breeth memory on mount
  useEffect(() => {
    loadBreethHistory()
  }, [])

  const loadBreethHistory = async () => {
    setIsLoadingMemories(true)
    setBreethError(null)
    try {
      const edges = await retrieveAnalyses()
      setBreethMemories(edges)
    } catch (err) {
      console.error("Breeth load failed:", err)
      setBreethError(err instanceof Error ? err.message : "Failed to load history")
    } finally {
      setIsLoadingMemories(false)
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    setIsAnalyzing(true)
    setSaved(false)
    setSimilarIncidents([])

    // Run analysis
    await new Promise((r) => setTimeout(r, 600))
    const result = analyzeDatabase(infoData)
    setAnalysis(result)
    setIsAnalyzing(false)

    // Auto-search similar incidents
    if (result.issues.length > 0) {
      setIsSearchingSimilar(true)
      try {
        const edges = await searchSimilarAnalyses(result.issues.join(" "))
        setSimilarIncidents(edges)
      } catch (err) {
        console.error("Similar search failed:", err)
      } finally {
        setIsSearchingSimilar(false)
      }
    }
  }

  const handleSave = async () => {
    if (!analysis) return
    setIsSaving(true)
    try {
      const hits = Number(infoData.keyspace_hits) || 0
      const misses = Number(infoData.keyspace_misses) || 0
      const record: AnalysisRecord = {
        timestamp: new Date().toISOString(),
        healthScore: analysis.healthScore,
        rootCause: analysis.rootCause,
        riskAssessment: analysis.riskAssessment,
        issues: analysis.issues,
        recommendations: analysis.recommendations,
        optimizations: analysis.optimizations,
        metricsSnapshot: {
          used_memory: infoData.used_memory,
          connected_clients: infoData.connected_clients,
          hitRatio: calculateHitRatio(hits, misses),
          keyspace_hits: hits,
          keyspace_misses: misses,
          total_commands_processed: infoData.total_commands_processed,
        },
      }
      await saveAnalysis(record)
      setSaved(true)
      setBreethError(null)
      await loadBreethHistory()
    } catch (err) {
      console.error("Save failed:", err)
      setBreethError(err instanceof Error ? err.message : "Failed to save analysis")
    } finally {
      setIsSaving(false)
    }
  }

  const handleCommand = async (input?: string) => {
    const query = input || commandInput
    if (!query.trim()) return

    setIsInterpreting(true)
    setCommandError(null)
    setCommandResult(null)
    try {
      const result = await interpretQuery(query)
      setCommandResult(result)

      // Persist the interaction to Breeth memory (best-effort).
      if (result.isSafe && result.generatedCommand) {
        try {
          await saveCommandInteraction(query, result.generatedCommand, result.explanation)
        } catch (err) {
          console.error("Command save failed:", err)
        }
      }
    } catch (err) {
      console.error("Interpret failed:", err)
      setCommandError(err instanceof Error ? err.message : "Failed to interpret query")
    } finally {
      setIsInterpreting(false)
    }
  }

  // ── Computed Metrics ────────────────────────────────────────────────────────

  const usedMemory = Number(infoData.used_memory) || 0
  const totalCommands = Number(infoData.total_commands_processed) || 0
  const hits = Number(infoData.keyspace_hits) || 0
  const misses = Number(infoData.keyspace_misses) || 0
  const hitRatio = calculateHitRatio(hits, misses)
  const connectedClients = Number(infoData.connected_clients) || 0
  const uptimeSeconds = Number(infoData.uptime_in_seconds) || 0
  const uptimeFormatted = uptimeSeconds > 86400
    ? `${Math.floor(uptimeSeconds / 86400)}d ${Math.floor((uptimeSeconds % 86400) / 3600)}h`
    : uptimeSeconds > 3600
      ? `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`
      : `${Math.floor(uptimeSeconds / 60)}m`

  return (
    <RouteContainer className="relative">
      <ParticleWave />
      <AppHeader icon={<BrainCircuit size={22} />} title="AI Copilot" />

      <div className="flex flex-col gap-6 overflow-y-auto pb-6">
        {/* ── Metrics Bar ──────────────────────────────────────────────────── */}
        <section>
          <h2 className="section-title">Current Database Health</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <MetricCard label="Memory" value={formatBytes(usedMemory)} />
            <MetricCard label="Operations" value={totalCommands.toLocaleString()} />
            <MetricCard label="Hit Ratio" value={hitRatio} />
            <MetricCard label="Clients" value={String(connectedClients)} />
            <MetricCard label="Uptime" value={uptimeFormatted} />
          </div>
        </section>

        {/* ── Action Bar ───────────────────────────────────────────────────── */}
        <section className="flex flex-wrap gap-3">
          <button className="btn-primary" disabled={isAnalyzing} onClick={handleAnalyze}>
            {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
            {isAnalyzing ? "Analyzing..." : "Analyze Database"}
          </button>
          {analysis && (
            <button className="btn-success" disabled={isSaving || saved} onClick={handleSave}>
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saved ? "Saved to Breeth ✓" : "Save to Memory"}
            </button>
          )}
        </section>

        {/* ── Analysis Results ──────────────────────────────────────────────── */}
        {analysis && (
          <>
          {/* Health Score + Breakdown (full width) */}
          <section className={`card ${getScoreBg(analysis.healthScore)}`}>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-4 md:w-64 shrink-0">
                <Heart size={36} className={getScoreColor(analysis.healthScore)} />
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Health Score</p>
                  <p className={`text-4xl font-bold ${getScoreColor(analysis.healthScore)}`}>
                    {analysis.healthScore}<span className="text-xl text-gray-400">/100</span>
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span title="Share of the analysis backed by live metrics">
                      Confidence {analysis.confidence}%
                    </span>
                    <span>•</span>
                    <span>{new Date(analysis.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>

              {/* Breakdown bars */}
              <div className="flex-1 space-y-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Score Breakdown</p>
                {analysis.breakdown.map((cat) => (
                  <div key={cat.label} className="flex items-center gap-3">
                    <span className="text-xs w-36 shrink-0 text-gray-600 dark:text-gray-300">{cat.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-tw-dark-border overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor(cat.status)}`}
                        style={{ width: `${(cat.earned / cat.max) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono w-14 text-right text-gray-600 dark:text-gray-300">
                      +{cat.earned}/{cat.max}
                    </span>
                  </div>
                ))}
                <div className="pt-1 space-y-0.5">
                  {analysis.breakdown.map((cat) => (
                    <p key={cat.label} className="text-[11px] text-gray-400 leading-tight">
                      <span className="font-medium text-gray-500 dark:text-gray-300">{cat.label}:</span> {cat.reason}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Root Cause */}
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                <Zap size={16} className="text-orange-500" />
                <h3 className="font-semibold text-sm">Root Cause</h3>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{analysis.rootCause}</p>
            </div>

            {/* Risk Assessment */}
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={16} className="text-red-400" />
                <h3 className="font-semibold text-sm">Risk Assessment</h3>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">{analysis.riskAssessment}</p>
            </div>

            {/* Optimization Opportunities */}
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={16} className="text-blue-500" />
                <h3 className="font-semibold text-sm">Optimizations</h3>
              </div>
              <ul className="space-y-1">
                {analysis.optimizations.map((opt, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300">• {opt}</li>
                ))}
              </ul>
            </div>

            {/* Issues */}
            {analysis.issues.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} className="text-yellow-500" />
                  <h3 className="font-semibold text-sm">Issues ({analysis.issues.length})</h3>
                </div>
                <ul className="space-y-1">
                  {analysis.issues.map((issue, i) => (
                    <li key={i} className="text-sm text-gray-700 dark:text-gray-300">• {issue}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            <div className="card">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-green-500" />
                <h3 className="font-semibold text-sm">Recommendations</h3>
              </div>
              <ul className="space-y-1">
                {analysis.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-gray-700 dark:text-gray-300">• {rec}</li>
                ))}
              </ul>
            </div>
          </section>
          </>
        )}

        {/* ── Empty State ──────────────────────────────────────────────────── */}
        {!analysis && !isAnalyzing && (
          <div className="empty-state">
            <BrainCircuit size={40} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">No analysis yet</p>
            <p className="text-sm mt-1">Click "Analyze Database" to get health insights.</p>
          </div>
        )}

        {/* ── Why This Recommendation (Demo Mode) ──────────────────────────── */}
        {analysis && similarIncidents.length > 0 && (
          <section>
            <h2 className="section-title flex items-center gap-2">
              <Lightbulb size={14} className="text-yellow-500" />
              Why This Recommendation?
            </h2>
            <div className="card bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase">Current Metrics</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Memory: {formatBytes(usedMemory)} | Hit Ratio: {hitRatio} | Clients: {connectedClients}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase">Previous Similar Investigation (Breeth Memory)</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{similarIncidents[0].fact}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase">Reasoning</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Based on the current {analysis.rootCause.toLowerCase()} and a similar past incident,
                    the system recommends: {analysis.recommendations[0]}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {isSearchingSimilar && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Loader2 size={14} className="animate-spin" />
            Searching Breeth memory for similar incidents...
          </div>
        )}

        {/* ── Natural Language Commands ─────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title flex items-center gap-2 mb-0">
              <Terminal size={14} />
              Ask Valkey
            </h2>
            <button
              onClick={() => setShowDebug((v) => !v)}
              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-tw-dark-border
                text-gray-500 dark:text-gray-400 hover:text-primary hover:border-primary transition-colors"
            >
              {showDebug ? "Hide" : "Show"} Debug Mode
            </button>
          </div>
          <div className="card">
            <div className="flex gap-2">
              <input
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCommand()}
                placeholder="e.g., Which keys use the most memory? Find keys without TTL..."
                disabled={isInterpreting}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-tw-dark-border
                  rounded-lg bg-white dark:bg-tw-dark-primary dark:text-white
                  focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              />
              <button className="btn-primary" onClick={() => handleCommand()} disabled={isInterpreting}>
                {isInterpreting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquare size={16} />}
                {isInterpreting ? "Thinking..." : "Ask"}
              </button>
            </div>

            {/* Suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {getSuggestions().slice(0, 6).map((suggestion) => (
                <button
                  key={suggestion}
                  disabled={isInterpreting}
                  onClick={() => { setCommandInput(suggestion); handleCommand(suggestion) }}
                  className="px-2.5 py-1 text-xs bg-gray-100 dark:bg-tw-dark-border text-gray-600 
                    dark:text-gray-300 rounded-full hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            {/* Error state */}
            {commandError && (
              <div className="mt-4 border-t border-gray-200 dark:border-tw-dark-border pt-4">
                <div className="flex items-start gap-2 text-red-500">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <p className="text-sm">{commandError}</p>
                </div>
              </div>
            )}

            {/* Command Result */}
            {commandResult && !commandError && (
              <div className="mt-4 border-t border-gray-200 dark:border-tw-dark-border pt-4">
                {/* Interpreted intent header */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Detected Intent</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {commandResult.intent}
                  </span>
                  <span className="text-xs text-gray-400">
                    confidence {(commandResult.confidence * 100).toFixed(0)}%
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    commandResult.source === "groq" ? "bg-blue-500/10 text-blue-500"
                    : commandResult.source === "blocked" ? "bg-red-500/10 text-red-500"
                    : "bg-gray-500/10 text-gray-500"
                  }`}>
                    {commandResult.source}
                  </span>
                </div>

                {commandResult.intent === "UNKNOWN" || !commandResult.isSafe ? (
                  <div className="flex items-start gap-2 text-yellow-600 dark:text-yellow-500">
                    <Shield size={16} className="mt-0.5 shrink-0" />
                    <p className="text-sm">{commandResult.explanation}</p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                        Generated Command
                      </p>
                      <pre className="bg-gray-900 text-green-400 text-sm p-3 rounded-lg overflow-x-auto font-mono">
                        {commandResult.generatedCommand}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1">
                        Explanation
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {commandResult.explanation}
                      </p>
                    </div>
                  </>
                )}

                {/* Debug Mode panel */}
                {showDebug && (
                  <div className="mt-4 border border-dashed border-gray-300 dark:border-tw-dark-border rounded-lg p-3 bg-gray-50 dark:bg-tw-dark-border/30">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Debug Mode</p>
                    <dl className="text-xs space-y-1 font-mono text-gray-600 dark:text-gray-300">
                      <div><span className="text-gray-400">User Query:</span> {commandResult.query}</div>
                      <div><span className="text-gray-400">Detected Intent:</span> {commandResult.intent}</div>
                      <div><span className="text-gray-400">Confidence:</span> {commandResult.confidence}</div>
                      <div><span className="text-gray-400">Source:</span> {commandResult.source}</div>
                      <div><span className="text-gray-400">Generated Command:</span> {commandResult.generatedCommand || "(none)"}</div>
                      {commandResult.parseError && (
                        <div className="text-yellow-600 dark:text-yellow-500">
                          <span className="text-gray-400">Parse Note:</span> {commandResult.parseError}
                        </div>
                      )}
                    </dl>
                    {commandResult.rawResponse && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-400 mb-1">Raw LLM Response:</p>
                        <pre className="text-[11px] bg-gray-900 text-gray-300 p-2 rounded overflow-x-auto max-h-40">
                          {commandResult.rawResponse}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* ── Breeth Memory Panel ──────────────────────────────────────────── */}
        {breethError && (
          <div className="border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10 rounded-lg p-3 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
            <AlertTriangle size={16} />
            Breeth Memory: {breethError}
          </div>
        )}
        {(breethMemories.length > 0 || isLoadingMemories) && (
          <section>
            <h2 className="section-title flex items-center gap-2">
              <Clock size={14} />
              Past Investigations (Breeth Memory)
            </h2>
            {isLoadingMemories ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                Loading from Breeth...
              </div>
            ) : (
              <div className="space-y-2">
                {breethMemories.map((edge) => (
                  <div key={edge.edge_uuid} className="card py-2.5 px-3 flex items-start gap-2">
                    <BrainCircuit size={14} className="text-purple-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-gray-700 dark:text-gray-300">{edge.fact}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ── Similar Incidents ─────────────────────────────────────────────── */}
        {similarIncidents.length > 1 && (
          <section>
            <h2 className="section-title flex items-center gap-2">
              <Search size={14} />
              Similar Incidents
            </h2>
            <div className="space-y-2">
              {similarIncidents.slice(1).map((edge) => (
                <div key={edge.edge_uuid} className="card py-2.5 px-3 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{edge.fact}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </RouteContainer>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 dark:border-tw-dark-border rounded-lg p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-semibold dark:text-white">{value}</p>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-500"
  if (score >= 60) return "text-yellow-500"
  return "text-red-500"
}

function getScoreBg(score: number) {
  if (score >= 80) return "bg-green-500/10 border-green-500/30"
  if (score >= 60) return "bg-yellow-500/10 border-yellow-500/30"
  return "bg-red-500/10 border-red-500/30"
}

function barColor(status: "good" | "warn" | "critical" | "unknown") {
  switch (status) {
    case "good": return "bg-green-500"
    case "warn": return "bg-yellow-500"
    case "critical": return "bg-red-500"
    default: return "bg-gray-400"
  }
}
