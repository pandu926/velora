'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

// --- Types ---

interface EvidenceItem {
  type: string
  description: string
  source: string
  data: unknown
  weight: number
}

interface CourtArgument {
  claim: string
  reasoning: string
  evidence: EvidenceItem[]
}

interface DebateRound {
  round: number
  prosecution: CourtArgument
  defense: CourtArgument
}

interface CourtVerdict {
  decision: 'prosecution' | 'defense' | 'insufficient_evidence'
  evidenceScore: number
  reasoning: string
  action: string
  params?: Record<string, unknown>
}

interface CourtCase {
  id: string
  timestamp: number
  rounds: DebateRound[]
  verdict: CourtVerdict
  converged: boolean
  totalRounds: number
  transcript: string
}

interface CoordinationResult {
  gated: boolean
  executed?: boolean
  reason?: string
  coordination?: {
    delegated: boolean
    chain: string[]
    traderAddress: string | null
    fallbackMode: boolean
    subDelegationId: string | null
    execution?: {
      status: string
      txHash?: string
      taskId: string
      feePaid?: string
    } | null
  }
}

// --- Sub-components ---

function EvidenceScoreMeter({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score))

  const getGradientColor = (value: number): string => {
    if (value >= 65) return 'from-emerald-500 to-emerald-400'
    if (value >= 40) return 'from-amber-500 to-yellow-400'
    return 'from-red-500 to-red-400'
  }

  const getTextColor = (value: number): string => {
    if (value >= 65) return 'text-emerald-400'
    if (value >= 40) return 'text-amber-400'
    return 'text-red-400'
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">Evidence Score</span>
        <span className={`text-sm font-bold font-mono ${getTextColor(clampedScore)}`}>
          {clampedScore}/100
        </span>
      </div>
      <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${getGradientColor(clampedScore)} transition-all duration-1000 ease-out`}
          style={{ width: `${clampedScore}%` }}
        />
      </div>
      <div className="flex justify-between text-[9px] text-gray-600 font-mono">
        <span>HOLD (&lt;40)</span>
        <span>UNCERTAIN</span>
        <span>EXECUTE (&ge;65)</span>
      </div>
    </div>
  )
}

function EvidenceTypeBadge({ type }: { type: string }) {
  const safeType = typeof type === 'string' && type.length > 0 ? type : 'evidence'
  const colorMap: Record<string, string> = {
    market_data: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    on_chain: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    historical: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    risk_metric: 'bg-red-500/20 text-red-300 border-red-500/30',
    protocol: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  }

  const style = colorMap[safeType] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${style}`}>
      {safeType.replace(/_/g, ' ')}
    </span>
  )
}

/** Normalize the AI's non-deterministic evidence shape into renderable items. */
function normalizeEvidence(evidence: unknown): EvidenceItem[] {
  if (!Array.isArray(evidence)) return []
  return evidence.map((raw, idx): EvidenceItem => {
    if (raw != null && typeof raw === 'object') {
      const o = raw as Record<string, unknown>
      return {
        type: typeof o.type === 'string' ? o.type : 'evidence',
        description:
          typeof o.description === 'string'
            ? o.description
            : typeof o.claim === 'string'
              ? o.claim
              : `Evidence #${typeof o.index === 'number' ? o.index : idx + 1}`,
        source: typeof o.source === 'string' ? o.source : 'on-chain',
        data: o.data ?? null,
        weight: typeof o.weight === 'number' ? o.weight : 1,
      }
    }
    // Primitive (e.g. an index number referencing the shared evidence pool)
    return {
      type: 'evidence',
      description: `Evidence reference #${String(raw)}`,
      source: 'on-chain',
      data: null,
      weight: 1,
    }
  })
}

function CollapsibleEvidence({ evidence }: { evidence: unknown }) {
  const [expanded, setExpanded] = useState(false)
  const items = normalizeEvidence(evidence)

  if (items.length === 0) return null

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors uppercase tracking-wider font-medium"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        {items.length} evidence item{items.length !== 1 ? 's' : ''}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 animate-fade-in">
          {items.map((item, idx) => (
            <div key={idx} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
              <div className="flex items-center gap-2 mb-1.5">
                <EvidenceTypeBadge type={item.type} />
                <span className="text-[10px] text-gray-600 font-mono">
                  weight: {item.weight}
                </span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">{item.description}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-gray-600">Source:</span>
                <span className="text-[10px] text-gray-400 font-mono">{item.source}</span>
              </div>
              {item.data != null && (
                <pre className="mt-1.5 text-[10px] text-gray-500 font-mono bg-black/30 rounded p-1.5 overflow-x-auto max-h-20">
                  {typeof item.data === 'string' ? item.data : JSON.stringify(item.data, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ArgumentCard({
  side,
  argument,
}: {
  side: 'prosecution' | 'defense'
  argument: CourtArgument
}) {
  const isProsecution = side === 'prosecution'
  const colors = isProsecution
    ? {
        border: 'border-blue-500/30',
        bg: 'bg-blue-500/5',
        dot: 'bg-blue-400',
        text: 'text-blue-400',
        label: 'PROSECUTION',
        icon: (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
          </svg>
        ),
      }
    : {
        border: 'border-red-500/30',
        bg: 'bg-red-500/5',
        dot: 'bg-red-400',
        text: 'text-red-400',
        label: 'DEFENSE',
        icon: (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
          </svg>
        ),
      }

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-4 sm:p-5 flex-1`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`${colors.dot} rounded-full p-1 ${colors.text}`}>
          {colors.icon}
        </div>
        <span className={`text-xs font-bold uppercase tracking-wider ${colors.text}`}>
          {colors.label}
        </span>
      </div>

      {/* Claim */}
      <div className="mb-3">
        <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">Claim</span>
        <p className="text-sm text-gray-200 leading-relaxed mt-1 font-medium">
          &ldquo;{argument.claim}&rdquo;
        </p>
      </div>

      {/* Reasoning */}
      <div className="mb-2">
        <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">Reasoning</span>
        <p className="text-xs text-gray-400 leading-relaxed mt-1 italic">
          {argument.reasoning}
        </p>
      </div>

      {/* Evidence */}
      <CollapsibleEvidence evidence={argument.evidence} />
    </div>
  )
}

function VerdictBadge({ decision }: { decision: string }) {
  const styles: Record<string, string> = {
    prosecution: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    defense: 'bg-red-500/20 text-red-300 border-red-500/40',
    insufficient_evidence: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  }

  const labels: Record<string, string> = {
    prosecution: 'APPROVED',
    defense: 'REJECTED',
    insufficient_evidence: 'INSUFFICIENT',
  }

  const style = styles[decision] || styles.insufficient_evidence
  const label = labels[decision] || decision

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${style}`}>
      {label}
    </span>
  )
}

function CourtInSessionAnimation({ step }: { step: number }) {
  const steps = [
    { label: 'Gathering live evidence', detail: 'CoinGecko, DefiLlama, Fear & Greed, on-chain volatility', color: 'text-blue-400', bg: 'bg-blue-400' },
    { label: 'Prosecution building case', detail: 'Citing evidence, proposing action with specific parameters', color: 'text-purple-400', bg: 'bg-purple-400' },
    { label: 'Defense challenging', detail: 'Cross-examining evidence quality, highlighting risks', color: 'text-red-400', bg: 'bg-red-400' },
    { label: 'Judge deliberating', detail: 'Venice AI scoring evidence freshness, logic, risk proportionality', color: 'text-amber-400', bg: 'bg-amber-400' },
  ]

  return (
    <div className="py-8 animate-fade-in">
      <div className="space-y-3">
        {steps.map((s, idx) => {
          const isActive = idx === step
          const isDone = idx < step
          const isPending = idx > step

          return (
            <div
              key={s.label}
              className={`flex items-start gap-4 p-4 rounded-lg border transition-all duration-500 ${
                isActive
                  ? 'bg-white/[0.04] border-white/[0.1]'
                  : isDone
                  ? 'bg-white/[0.02] border-white/[0.05] opacity-60'
                  : 'bg-transparent border-white/[0.03] opacity-30'
              }`}
            >
              {/* Step indicator */}
              <div className="flex-shrink-0 mt-0.5">
                {isDone ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                    <svg className="w-3 h-3 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                ) : isActive ? (
                  <div className="w-5 h-5 rounded-full bg-white/[0.06] border border-white/[0.15] flex items-center justify-center">
                    <span className={`w-2 h-2 rounded-full ${s.bg} animate-pulse`} />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-white/[0.03] border border-white/[0.06]" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isActive ? s.color : isDone ? 'text-gray-400' : 'text-gray-600'}`}>
                  {s.label}
                  {isActive && <span className="inline-block ml-1 animate-pulse">...</span>}
                </p>
                {(isActive || isDone) && (
                  <p className="text-[11px] text-gray-500 mt-0.5">{s.detail}</p>
                )}
              </div>

              {/* Timing */}
              {isDone && (
                <span className="text-[10px] text-gray-600 font-mono flex-shrink-0">done</span>
              )}
              {isActive && (
                <span className="text-[10px] text-gray-500 font-mono flex-shrink-0 animate-pulse">running</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Main Component ---

export function EvidenceCourt({ delegationId }: { delegationId?: string | null }) {
  const [courtCase, setCourtCase] = useState<CourtCase | null>(null)
  const [coordination, setCoordination] = useState<CoordinationResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [courtStep, setCourtStep] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<CourtCase[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (isRunning) {
      setCourtStep(0)
      const intervals = [3000, 6000, 5000]
      let elapsed = 0
      const timers: NodeJS.Timeout[] = []
      intervals.forEach((delay, idx) => {
        elapsed += delay
        timers.push(setTimeout(() => setCourtStep(idx + 1), elapsed))
      })
      stepTimerRef.current = timers[timers.length - 1] ?? null
      return () => timers.forEach(clearTimeout)
    }
  }, [isRunning])

  const runCourtSession = useCallback(async () => {
    setIsRunning(true)
    setError(null)
    setCourtCase(null)
    setCoordination(null)

    try {
      const body: Record<string, unknown> = {}
      if (delegationId) {
        body.rootDelegationId = delegationId
        body.execute = true // settle the verdict on-chain via the A2A chain
      }
      const res = await fetch('/api/court', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error(`Court session failed: ${res.status}`)
      }
      const data = await res.json()
      setCourtCase(data.courtCase ?? data)
      // Backend returns { courtCase, coordination }. coordination is the gate
      // result: { gated, reason } when withheld, or { gated, executed,
      // coordination: { chain, execution, ... } } when settled on-chain.
      if (data.coordination !== undefined) {
        setCoordination(data.coordination as CoordinationResult)
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to run court session'
      setError(message)
    } finally {
      setIsRunning(false)
    }
  }, [delegationId])

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/court/history')
      if (res.ok) {
        const data = await res.json()
        const cases = Array.isArray(data) ? data : (data.cases ?? [])
        setHistory(cases)
      }
    } catch {
      // History fetch is non-critical
    }
  }, [])

  const handleToggleHistory = useCallback(() => {
    if (!showHistory) {
      fetchHistory()
    }
    setShowHistory(prev => !prev)
  }, [showHistory, fetchHistory])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-600/20 border border-amber-500/30 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Evidence Court</h2>
            <p className="text-[10px] text-gray-500">AI agents debate with verifiable evidence</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleHistory}
            className="px-3 py-1.5 text-[10px] font-medium text-gray-400 hover:text-white border border-white/10 hover:border-white/20 rounded-lg transition-all"
          >
            History
          </button>
          <button
            onClick={runCourtSession}
            disabled={isRunning}
            className="px-4 py-2 text-xs font-bold text-black bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
          >
            {isRunning ? 'In Session...' : 'Run Court Session'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent p-4 sm:p-6">
        {isRunning && <CourtInSessionAnimation step={courtStep} />}

        {error && !isRunning && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={runCourtSession}
              className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
            >
              Try again
            </button>
          </div>
        )}

        {!isRunning && !error && !courtCase && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-300 mb-1">No Active Court Session</h3>
            <p className="text-xs text-gray-600 max-w-sm">
              Click &ldquo;Run Court Session&rdquo; to trigger an evidence-based debate between prosecution and defense agents.
            </p>
          </div>
        )}

        {!isRunning && courtCase && (
          <div className="space-y-5 animate-fade-in">
            {/* Case Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <span className="text-[10px] text-gray-600 uppercase tracking-wider">Verdict Action</span>
                <p className="text-sm text-gray-200 font-medium mt-0.5 capitalize">{courtCase.verdict.action}</p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-600 font-mono block">
                  {new Date(courtCase.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-[10px] text-gray-500">
                  {courtCase.totalRounds} round{courtCase.totalRounds !== 1 ? 's' : ''}{courtCase.converged ? ' (converged)' : ''}
                </span>
              </div>
            </div>

            {/* Debate Rounds */}
            {courtCase.rounds.map((round) => (
              <div key={round.round} className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Round {round.round}
                  </span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <ArgumentCard side="prosecution" argument={round.prosecution} />
                  <ArgumentCard side="defense" argument={round.defense} />
                </div>
              </div>
            ))}

            {/* Verdict */}
            <div className="rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    Judge Verdict
                  </span>
                  <span className="px-2 py-0.5 rounded text-[9px] font-medium bg-amber-500/10 border border-amber-500/20 text-amber-300/80">
                    Venice AI
                  </span>
                </div>
                <VerdictBadge decision={courtCase.verdict.decision} />
              </div>

              <p className="text-sm text-gray-200 leading-relaxed">
                {courtCase.verdict.reasoning}
              </p>

              {courtCase.verdict.params && Object.keys(courtCase.verdict.params).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(courtCase.verdict.params).map(([key, val]) => (
                    <span key={key} className="px-2 py-1 rounded bg-white/[0.04] border border-white/10 text-[10px] font-mono text-gray-400">
                      {key}: {String(val)}
                    </span>
                  ))}
                </div>
              )}

              <EvidenceScoreMeter score={courtCase.verdict.evidenceScore} />

              {/* Venice AI attribution */}
              <div className="flex items-center justify-between pt-3 border-t border-white/5">
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60" />
                  Powered by Venice AI
                </div>
                <span className="text-[10px] font-mono text-gray-600">deepseek-v4-pro</span>
              </div>
            </div>

            {/* A2A Settlement — the unified chain: court verdict → redelegation → 1Shot relay */}
            {coordination && (
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/5 to-transparent p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    A2A Settlement
                  </span>
                </div>

                {!coordination.gated && (
                  <p className="text-xs text-gray-400">{coordination.reason}</p>
                )}

                {coordination.coordination && (
                  <div className="space-y-2.5">
                    {/* Delegation chain visual */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                      {coordination.coordination.chain.map((link, idx) => (
                        <span key={idx} className="px-2 py-1 rounded bg-white/[0.04] border border-white/10 text-gray-300">
                          {link.length > 24 ? `${link.slice(0, 10)}…${link.slice(-6)}` : link}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-4 text-[11px]">
                      <span className="text-gray-500">
                        Redelegated:{' '}
                        <span className={coordination.coordination.delegated ? 'text-emerald-400' : 'text-red-400'}>
                          {coordination.coordination.delegated ? 'yes' : 'no'}
                        </span>
                      </span>
                      {coordination.coordination.traderAddress && (
                        <span className="text-gray-500 font-mono">
                          Trader: {coordination.coordination.traderAddress.slice(0, 8)}…
                        </span>
                      )}
                    </div>

                    {/* On-chain settlement result */}
                    {coordination.coordination.execution && (
                      <div className="pt-2 border-t border-white/5 space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-gray-500">Status:</span>
                          <span className={coordination.coordination.execution.status === 'confirmed' ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                            {coordination.coordination.execution.status}
                          </span>
                          {coordination.coordination.execution.feePaid && (
                            <span className="text-gray-600 font-mono">
                              gas: {(Number(coordination.coordination.execution.feePaid) / 1e6).toFixed(2)} USDC
                            </span>
                          )}
                        </div>
                        {coordination.coordination.execution.txHash && (
                          <a
                            href={`https://basescan.org/tx/${coordination.coordination.execution.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300 hover:text-emerald-200 underline font-mono break-all"
                          >
                            {coordination.coordination.execution.txHash.slice(0, 18)}… ↗ Basescan
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-4 sm:p-5 animate-fade-in">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3">Court History</h3>
          {history.length === 0 ? (
            <p className="text-xs text-gray-600">No past court sessions found.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {history.map((pastCase) => (
                <button
                  key={pastCase.id}
                  onClick={() => setCourtCase(pastCase)}
                  className="w-full text-left p-3 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-300 truncate flex-1 capitalize">{pastCase.verdict.action}</span>
                    <VerdictBadge decision={pastCase.verdict.decision} />
                  </div>
                  <span className="text-[10px] text-gray-600 font-mono mt-1 block">
                    {new Date(pastCase.timestamp).toLocaleString()} — score: {pastCase.verdict.evidenceScore}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
