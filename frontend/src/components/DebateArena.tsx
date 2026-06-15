'use client'

import { useState, useEffect, useCallback } from 'react'

interface DebateRound {
  round: number
  proposer: {
    agent: string
    argument: string
    evidence: string[]
  }
  challenger: {
    agent: string
    argument: string
    risks: string[]
  }
}

interface DebateVerdict {
  decision: string
  confidence: number
  reasoning: string
}

interface DebateResult {
  id: string
  topic: string
  rounds: DebateRound[]
  verdict?: DebateVerdict
  timestamp: string
}

interface DebateArenaProps {
  debateResult?: DebateResult
  isLive?: boolean
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const getColor = (value: number): string => {
    if (value >= 80) return 'from-emerald-500 to-emerald-400'
    if (value >= 60) return 'from-blue-500 to-blue-400'
    if (value >= 40) return 'from-amber-500 to-amber-400'
    return 'from-red-500 to-red-400'
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Confidence</span>
        <span className="text-xs font-mono text-white">{confidence}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${getColor(confidence)} animate-fill-bar`}
          style={{ width: `${confidence}%` }}
        />
      </div>
    </div>
  )
}

function AgentCard({
  role,
  agent,
  argument,
  points,
  pointsLabel,
  colorScheme,
}: {
  role: string
  agent: string
  argument: string
  points: string[]
  pointsLabel: string
  colorScheme: 'green' | 'red'
}) {
  const colors = colorScheme === 'green'
    ? { border: 'border-emerald-500/30', bg: 'bg-emerald-500/5', dot: 'bg-emerald-400', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300' }
    : { border: 'border-red-500/30', bg: 'bg-red-500/5', dot: 'bg-red-400', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300' }

  return (
    <div className={`glass ${colors.border} ${colors.bg} p-4 sm:p-5 flex-1`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
        <span className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
          {role}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${colors.badge}`}>
          {agent}
        </span>
      </div>

      <p className="text-sm text-gray-200 leading-relaxed mb-3">
        &ldquo;{argument}&rdquo;
      </p>

      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-500">{pointsLabel}</span>
        {points.map((point, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className={`text-xs mt-0.5 ${colors.text}`}>&#x2022;</span>
            <span className="text-xs text-gray-400">{point}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const MOCK_DEBATE: DebateResult = {
  id: 'debate-001',
  topic: 'Should we increase WETH allocation by 10%?',
  timestamp: new Date().toISOString(),
  rounds: [
    {
      round: 1,
      proposer: {
        agent: 'Scout',
        argument: 'WETH showing strong momentum with 5.2% gain in 24h. Volume up 340% on Base DEXs. RSI at 62 — bullish but not overbought.',
        evidence: ['Price +5.2% (24h)', 'Volume +340%', 'RSI 62 (bullish zone)', 'Whale accumulation detected'],
      },
      challenger: {
        agent: 'Skeptic',
        argument: 'Large whale sold 450 ETH on Aerodrome 2 hours ago. Slippage risk at 2.3% for our target size. Market-wide correlation suggests this is a broad pump, not ETH-specific.',
        risks: ['Whale exit (450 ETH sold)', 'Slippage 2.3% at target size', 'Correlated broad market pump', 'Gas spike risk on Base'],
      },
    },
  ],
  verdict: {
    decision: 'Execute 50% now, remaining 50% in 4 hours if momentum holds',
    confidence: 78,
    reasoning: 'Scout evidence is compelling but whale exit introduces timing risk. Split execution reduces slippage impact and allows reassessment.',
  },
}

export function DebateArena({ debateResult, isLive = false }: DebateArenaProps) {
  const [debate, setDebate] = useState<DebateResult | null>(debateResult || null)
  const [isLoading, setIsLoading] = useState(!debateResult)

  const fetchDebate = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/debate')
      if (res.ok) {
        const data = await res.json()
        if (data && data.id) {
          setDebate(data)
        } else {
          setDebate(MOCK_DEBATE)
        }
      } else {
        setDebate(MOCK_DEBATE)
      }
    } catch {
      setDebate(MOCK_DEBATE)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!debateResult) {
      fetchDebate()
    }
  }, [debateResult, fetchDebate])

  useEffect(() => {
    if (!isLive) return
    const interval = setInterval(fetchDebate, 10000)
    return () => clearInterval(interval)
  }, [isLive, fetchDebate])

  if (isLoading) {
    return (
      <div className="glass p-6 animate-pulse space-y-4">
        <div className="h-6 bg-white/5 rounded w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-40 bg-white/5 rounded-xl" />
          <div className="h-40 bg-white/5 rounded-xl" />
        </div>
        <div className="h-24 bg-white/5 rounded-xl" />
      </div>
    )
  }

  if (!debate) {
    return (
      <div className="glass p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
          <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-gray-400 text-sm">No active debate.</p>
        <p className="text-gray-600 text-xs mt-1">Debates start when the agent evaluates market conditions.</p>
      </div>
    )
  }

  const latestRound = debate.rounds[debate.rounds.length - 1]

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" />
            </svg>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wide">Debate Arena</h3>
          </div>
          {isLive && (
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-500 font-mono">
          Round {latestRound.round}
        </span>
      </div>

      {/* Topic */}
      <div className="glass p-3 border-white/5">
        <p className="text-xs text-gray-400">
          <span className="text-gray-500 mr-1">Topic:</span>
          {debate.topic}
        </p>
      </div>

      {/* Debate Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AgentCard
          role="Proposer"
          agent={latestRound.proposer.agent}
          argument={latestRound.proposer.argument}
          points={latestRound.proposer.evidence}
          pointsLabel="Evidence"
          colorScheme="green"
        />
        <AgentCard
          role="Challenger"
          agent={latestRound.challenger.agent}
          argument={latestRound.challenger.argument}
          points={latestRound.challenger.risks}
          pointsLabel="Risks"
          colorScheme="red"
        />
      </div>

      {/* Verdict */}
      {debate.verdict && (
        <div className="glass border-amber-500/20 bg-amber-500/5 p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              Commander Verdict
            </span>
          </div>

          <p className="text-sm text-gray-200 leading-relaxed">
            &ldquo;{debate.verdict.decision}&rdquo;
          </p>

          <p className="text-xs text-gray-500 italic">
            {debate.verdict.reasoning}
          </p>

          <ConfidenceBar confidence={debate.verdict.confidence} />
        </div>
      )}
    </div>
  )
}
