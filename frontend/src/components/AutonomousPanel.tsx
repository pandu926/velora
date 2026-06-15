'use client'

import { useState, useEffect, useCallback } from 'react'

interface StrategyAllocation {
  type: string
  protocol: string
  token: string
  percentage: number
  rationale: string
}

interface StrategyPlan {
  id: string
  allocations: StrategyAllocation[]
  rules: Record<string, number>
  reasoning: string
  generatedAt: number
}

interface PortfolioState {
  totalValue: number
  allocations: Record<string, { value: number; percentage: number; token: string }>
  realizedPnL: number
  unrealizedPnL: number
  dailyPnL: number
  targetProgress: number
}

interface AutonomousAction {
  id: string
  opportunity: { type: string; proposal: string; trigger: string; priority: string; timestamp: number }
  verdict: { approved: boolean; action: string; percentage: number; summary: string }
  executed: boolean
  txHash?: string
  timestamp: number
}

interface AutonomousState {
  status: 'idle' | 'planning' | 'scanning' | 'deliberating' | 'executing' | 'stopped'
  plan: StrategyPlan | null
  config: { targetValue: number; currentValue: number; riskLevel: string; timeframe: string } | null
  portfolio: PortfolioState | null
  pendingOpportunity: { type: string; proposal: string; priority: string } | null
  history: AutonomousAction[]
  startedAt: number | null
}

const STATUS_COLORS: Record<string, { dot: string; text: string; label: string }> = {
  idle: { dot: 'bg-gray-500', text: 'text-gray-400', label: 'Idle' },
  planning: { dot: 'bg-blue-500 animate-pulse', text: 'text-blue-400', label: 'Planning Strategy...' },
  scanning: { dot: 'bg-emerald-500 animate-pulse', text: 'text-emerald-400', label: 'Scanning Markets' },
  deliberating: { dot: 'bg-amber-500 animate-pulse', text: 'text-amber-400', label: 'Agents Deliberating' },
  executing: { dot: 'bg-purple-500 animate-pulse', text: 'text-purple-400', label: 'Executing On-Chain' },
  stopped: { dot: 'bg-red-500', text: 'text-red-400', label: 'Stopped' },
}

const ALLOC_COLORS: Record<string, string> = {
  lending: 'bg-blue-500',
  trading: 'bg-amber-500',
  reserve: 'bg-gray-500',
  arbitrage: 'bg-purple-500',
}

export function AutonomousPanel() {
  const [state, setState] = useState<AutonomousState | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [targetValue, setTargetValue] = useState('200')
  const [currentValue, setCurrentValue] = useState('100')
  const [riskLevel, setRiskLevel] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate')
  const [timeframe, setTimeframe] = useState('6m')
  const [expandedAction, setExpandedAction] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/autonomous/status')
      if (res.ok) setState(await res.json())
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  async function startLoop() {
    setStarting(true)
    try {
      const res = await fetch('/api/autonomous/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetValue: parseFloat(targetValue),
          currentValue: parseFloat(currentValue),
          riskLevel,
          timeframe,
          autoExecute: false,
        }),
      })
      if (res.ok) await fetchStatus()
    } catch {} finally { setStarting(false) }
  }

  async function stopLoop() {
    await fetch('/api/autonomous/stop', { method: 'POST' })
    await fetchStatus()
  }

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />)}</div>
  }

  const isRunning = state?.status === 'scanning' || state?.status === 'deliberating' || state?.status === 'executing'
  const statusInfo = STATUS_COLORS[state?.status ?? 'idle'] ?? STATUS_COLORS['idle']!

  return (
    <div className="space-y-4">
      {/* Header + Status */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">Autonomous Autopilot</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
            <span className={`text-[11px] ${statusInfo.text}`}>{statusInfo.label}</span>
            {state?.startedAt && isRunning && (
              <span className="text-[10px] text-gray-600 font-mono">
                Running {Math.round((Date.now() - state.startedAt) / 60000)}m
              </span>
            )}
          </div>
        </div>
        {isRunning && (
          <button onClick={stopLoop} className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors">
            Stop
          </button>
        )}
      </div>

      {/* Setup Form (when idle/stopped) */}
      {(!isRunning && !state?.plan) && (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
          <p className="text-[11px] text-gray-400">Set your target and let AI manage your portfolio autonomously.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Current ($)</label>
              <input type="number" value={currentValue} onChange={e => setCurrentValue(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white" />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Target ($)</label>
              <input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Risk Level</label>
              <select value={riskLevel} onChange={e => setRiskLevel(e.target.value as typeof riskLevel)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white">
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-wider">Timeframe</label>
              <select value={timeframe} onChange={e => setTimeframe(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white">
                <option value="1m">1 Month</option>
                <option value="3m">3 Months</option>
                <option value="6m">6 Months</option>
                <option value="12m">12 Months</option>
              </select>
            </div>
          </div>
          <button onClick={startLoop} disabled={starting}
            className="w-full py-2.5 text-sm font-bold rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 transition-all">
            {starting ? 'Generating Strategy...' : 'Start Autopilot'}
          </button>
        </div>
      )}

      {/* Strategy Allocation */}
      {state?.plan && (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Strategy Allocation</span>
            <span className="text-[10px] text-gray-600">
              ${state.config?.currentValue} → ${state.config?.targetValue} ({state.config?.riskLevel})
            </span>
          </div>

          {/* Allocation bar */}
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-white/5 p-0.5">
            {state.plan.allocations.map(a => (
              <div key={a.type} className={`${ALLOC_COLORS[a.type] ?? 'bg-gray-500'} rounded-full transition-all duration-700`}
                style={{ width: `${a.percentage}%` }} />
            ))}
          </div>

          {/* Allocation details */}
          <div className="space-y-1.5">
            {state.plan.allocations.map(a => (
              <div key={a.type} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${ALLOC_COLORS[a.type] ?? 'bg-gray-500'}`} />
                  <span className="text-[11px] text-gray-300 capitalize">{a.type}</span>
                  <span className="text-[10px] text-gray-600">{a.protocol}/{a.token}</span>
                </div>
                <span className="text-[11px] text-white font-mono">{a.percentage}%</span>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-gray-500 italic">{state.plan.reasoning}</p>
        </div>
      )}

      {/* Portfolio State */}
      {state?.portfolio && (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold font-mono text-white">${state.portfolio.totalValue.toFixed(0)}</p>
              <p className="text-[9px] text-gray-500">Portfolio</p>
            </div>
            <div>
              <p className={`text-lg font-bold font-mono ${state.portfolio.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {state.portfolio.unrealizedPnL >= 0 ? '+' : ''}{state.portfolio.unrealizedPnL.toFixed(2)}
              </p>
              <p className="text-[9px] text-gray-500">Unrealized</p>
            </div>
            <div>
              <p className="text-lg font-bold font-mono text-white">${state.config?.targetValue ?? 0}</p>
              <p className="text-[9px] text-gray-500">Target</p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Opportunity */}
      {state?.pendingOpportunity && (
        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 animate-pulse">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[10px] text-amber-400 uppercase font-medium">Deliberating: {state.pendingOpportunity.type.replace('_', ' ')}</span>
          </div>
          <p className="text-[10px] text-gray-400 line-clamp-2">{state.pendingOpportunity.proposal}</p>
        </div>
      )}

      {/* Action History */}
      {state?.history && state.history.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Decision History ({state.history.length})</span>
          {state.history.slice().reverse().slice(0, 10).map(action => (
            <div key={action.id} className={`p-2.5 rounded-xl border transition-all ${
              action.verdict.approved ? 'bg-emerald-500/[0.03] border-emerald-500/10' : 'bg-white/[0.02] border-white/5'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
                    action.verdict.approved ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>{action.verdict.approved ? 'APPROVED' : 'REJECTED'}</span>
                  <span className="text-[10px] text-white capitalize">{action.opportunity.type.replace('_', ' ')}</span>
                </div>
                <span className="text-[9px] text-gray-600 font-mono">{(action.verdict.percentage * 100).toFixed(0)}%</span>
              </div>
              {expandedAction === action.id && (
                <div className="mt-2 space-y-1">
                  <p className="text-[9px] text-gray-400">{action.opportunity.proposal}</p>
                  <p className="text-[9px] text-gray-500 italic">{action.verdict.summary}</p>
                  {action.txHash && <p className="text-[9px] text-blue-400 font-mono">tx: {action.txHash}</p>}
                  <p className="text-[8px] text-gray-600">Trigger: {action.opportunity.trigger}</p>
                </div>
              )}
              <button onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
                className="text-[8px] text-blue-400 hover:text-blue-300 mt-1">
                {expandedAction === action.id ? 'Less' : 'Details'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state when running but no history */}
      {isRunning && (!state?.history || state.history.length === 0) && !state?.pendingOpportunity && (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
          <p className="text-[11px] text-gray-400">Scanning real-time feeds for opportunities...</p>
          <p className="text-[9px] text-gray-600 mt-1">Binance WS + Alchemy + Pyth + Fear&Greed</p>
          <div className="flex items-center justify-center gap-1 mt-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400/50 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
