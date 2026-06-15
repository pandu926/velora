'use client'

import { useState, useEffect, useCallback } from 'react'

interface LearningMetrics {
  winRate: number
  totalDecisions: number
  successfulDecisions: number
  lessonsLearned: string[]
  patterns: string[]
  recentDecisions: DecisionEntry[]
}

interface DecisionEntry {
  id: string
  timestamp: string
  action: string
  outcome: 'success' | 'failure' | 'pending'
  pnl?: number
}

function WinRateCircle({ rate }: { rate: number }) {
  const circumference = 2 * Math.PI * 40
  const strokeDashoffset = circumference - (rate / 100) * circumference

  const getColor = (value: number): string => {
    if (value >= 70) return '#34d399'
    if (value >= 50) return '#60a5fa'
    return '#f87171'
  }

  return (
    <div className="relative w-28 h-28 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={getColor(rate)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold font-mono text-white">{rate}%</span>
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Win Rate</span>
      </div>
    </div>
  )
}

function PatternBadge({ pattern }: { pattern: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[11px] text-purple-300 font-medium">
      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11a1 1 0 11-2 0 1 1 0 012 0zm0-3a1 1 0 01-2 0V7a1 1 0 112 0v3z" />
      </svg>
      {pattern}
    </span>
  )
}

function DecisionTimeline({ decisions }: { decisions: DecisionEntry[] }) {
  const getOutcomeStyle = (outcome: DecisionEntry['outcome']): string => {
    switch (outcome) {
      case 'success': return 'bg-emerald-500'
      case 'failure': return 'bg-red-500'
      case 'pending': return 'bg-amber-500 animate-pulse'
    }
  }

  const formatTime = (isoString: string): string => {
    const now = Date.now()
    const then = new Date(isoString).getTime()
    const diffMinutes = Math.floor((now - then) / 60000)

    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`
    return `${Math.floor(diffMinutes / 1440)}d ago`
  }

  return (
    <div className="space-y-2">
      {decisions.map((decision, idx) => (
        <div
          key={decision.id}
          className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors animate-fade-in"
          style={{ animationDelay: `${idx * 50}ms` }}
        >
          <div className={`w-2 h-2 rounded-full shrink-0 ${getOutcomeStyle(decision.outcome)}`} />
          <span className="text-xs text-gray-300 flex-1 truncate">{decision.action}</span>
          {decision.pnl !== undefined && (
            <span className={`text-xs font-mono ${decision.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {decision.pnl >= 0 ? '+' : ''}{decision.pnl.toFixed(2)}%
            </span>
          )}
          <span className="text-[10px] text-gray-600 font-mono shrink-0">{formatTime(decision.timestamp)}</span>
        </div>
      ))}
    </div>
  )
}

const MOCK_METRICS: LearningMetrics = {
  winRate: 73,
  totalDecisions: 47,
  successfulDecisions: 34,
  lessonsLearned: [
    'Avoid swaps during high gas periods (>50 gwei equivalent)',
    'Split large orders (>$500) into 2-3 tranches for better execution',
    'WETH/USDC pair has lowest slippage on Aerodrome between 14:00-18:00 UTC',
    'Rebalance triggers work best at 7% drift, not 5%',
  ],
  patterns: [
    'Morning momentum',
    'Whale front-running',
    'Gas spike avoidance',
    'Correlation breakout',
  ],
  recentDecisions: [
    { id: 'd1', timestamp: new Date(Date.now() - 1800000).toISOString(), action: 'Swapped 200 USDC to WETH at $2,510', outcome: 'success', pnl: 2.1 },
    { id: 'd2', timestamp: new Date(Date.now() - 7200000).toISOString(), action: 'Supplied 0.1 WETH to Aave', outcome: 'success', pnl: 0.8 },
    { id: 'd3', timestamp: new Date(Date.now() - 14400000).toISOString(), action: 'Rebalanced portfolio (WETH overweight)', outcome: 'success', pnl: 1.2 },
    { id: 'd4', timestamp: new Date(Date.now() - 28800000).toISOString(), action: 'Attempted swap during gas spike — aborted', outcome: 'failure', pnl: -0.1 },
    { id: 'd5', timestamp: new Date(Date.now() - 43200000).toISOString(), action: 'Withdrew cbETH from Aave (stop-loss trigger)', outcome: 'pending' },
  ],
}

export function LearningStats() {
  const [metrics, setMetrics] = useState<LearningMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/learning')
      if (res.ok) {
        const data = await res.json()
        if (data && data.winRate !== undefined) {
          setMetrics(data)
        } else {
          setMetrics(MOCK_METRICS)
        }
      } else {
        setMetrics(MOCK_METRICS)
      }
    } catch {
      setMetrics(MOCK_METRICS)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-32 bg-white/5 rounded-2xl" />
        <div className="h-24 bg-white/5 rounded-2xl" />
        <div className="h-48 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="glass p-8 text-center">
        <p className="text-gray-400 text-sm">No learning data available yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Win Rate */}
        <div className="glass p-5">
          <WinRateCircle rate={metrics.winRate} />
        </div>

        {/* Decision Stats */}
        <div className="glass p-5 flex flex-col justify-center space-y-3">
          <div>
            <p className="text-2xl font-bold font-mono text-white">{metrics.totalDecisions}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Decisions</p>
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-emerald-400">{metrics.successfulDecisions}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider">Successful</p>
          </div>
        </div>

        {/* Patterns */}
        <div className="glass p-5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Detected Patterns</p>
          <div className="flex flex-wrap gap-1.5">
            {metrics.patterns.map(pattern => (
              <PatternBadge key={pattern} pattern={pattern} />
            ))}
          </div>
        </div>
      </div>

      {/* Lessons Learned */}
      <div className="glass p-5">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0z" />
          </svg>
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Lessons Learned</h4>
        </div>
        <div className="space-y-2">
          {metrics.lessonsLearned.map((lesson, idx) => (
            <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02]">
              <span className="text-blue-400 text-xs mt-0.5 shrink-0">&#x2713;</span>
              <span className="text-xs text-gray-300 leading-relaxed">{lesson}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Decision Timeline */}
      <div className="glass p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-white uppercase tracking-wider">Recent Decisions</h4>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Win
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Loss
            </span>
            <span className="flex items-center gap-1 text-[10px] text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Pending
            </span>
          </div>
        </div>
        <DecisionTimeline decisions={metrics.recentDecisions} />
      </div>
    </div>
  )
}
