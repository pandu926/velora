'use client'

import { useState, useEffect } from 'react'

interface InstanceStats {
  totalSessions: number
  totalOutcomes: number
  overallPnL: string
  winRate: number
  profitCount: number
  lossCount: number
  neutralCount: number
  agents: Array<{
    role: string
    model: string
    reputation: number
    accuracy: number
    totalSessions: number
    weight: number
  }>
}

export function PortfolioOverview() {
  const [stats, setStats] = useState<InstanceStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchStats() {
    try {
      const res = await fetch('/api/economy/leaderboard')
      if (!res.ok) return
      const data = await res.json() as { agents: Array<{ reputation: number; accuracy: number; totalSessions: number; weight: number; role: string; model: string }> }

      const pubRes = await fetch('/api/public/leaderboard')
      if (pubRes.ok) {
        const pub = await pubRes.json() as InstanceStats
        setStats({ ...pub, agents: data.agents })
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
        <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-400">Unable to load portfolio data</p>
        <p className="text-xs text-gray-600 mt-1">Ensure backend is running</p>
      </div>
    )
  }

  const topAgents = stats.agents.slice(0, 3)
  const avgReputation = stats.agents.length > 0
    ? stats.agents.reduce((sum, a) => sum + a.reputation, 0) / stats.agents.length
    : 50

  return (
    <div className="space-y-6">
      {/* Overall Performance */}
      <div className="text-center py-4">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">System Performance</p>
        <p className={`text-4xl sm:text-5xl font-bold font-mono tracking-tight ${
          stats.overallPnL.startsWith('+') ? 'text-emerald-400' : stats.overallPnL === '+$0.00' ? 'text-white' : 'text-red-400'
        }`}>
          {stats.overallPnL}
        </p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <span className="text-xs text-gray-400">
            <span className="text-white font-mono">{stats.totalSessions}</span> sessions
          </span>
          <span className="text-xs text-gray-400">
            <span className="text-white font-mono">{stats.totalOutcomes}</span> measured
          </span>
          <span className="text-xs text-gray-400">
            <span className={`font-mono ${stats.winRate > 50 ? 'text-emerald-400' : 'text-white'}`}>{stats.winRate}%</span> win rate
          </span>
        </div>
      </div>

      {/* Outcome Distribution */}
      {stats.totalOutcomes > 0 && (
        <div className="space-y-2">
          <div className="flex h-3 rounded-full overflow-hidden gap-0.5 bg-white/5 p-0.5">
            {stats.profitCount > 0 && (
              <div
                className="bg-emerald-500 rounded-full transition-all duration-700"
                style={{ width: `${(stats.profitCount / stats.totalOutcomes) * 100}%` }}
              />
            )}
            {stats.neutralCount > 0 && (
              <div
                className="bg-gray-500 rounded-full transition-all duration-700"
                style={{ width: `${(stats.neutralCount / stats.totalOutcomes) * 100}%` }}
              />
            )}
            {stats.lossCount > 0 && (
              <div
                className="bg-red-500 rounded-full transition-all duration-700"
                style={{ width: `${(stats.lossCount / stats.totalOutcomes) * 100}%` }}
              />
            )}
          </div>
          <div className="flex justify-between px-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[11px] text-gray-400">Profit ({stats.profitCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gray-500" />
              <span className="text-[11px] text-gray-400">Neutral ({stats.neutralCount})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[11px] text-gray-400">Loss ({stats.lossCount})</span>
            </div>
          </div>
        </div>
      )}

      {/* System Health */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Avg Reputation</p>
          <p className="text-2xl font-bold font-mono text-white mt-1">{avgReputation.toFixed(0)}</p>
          <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${avgReputation}%` }} />
          </div>
        </div>
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Active Agents</p>
          <p className="text-2xl font-bold font-mono text-white mt-1">{stats.agents.length}</p>
          <p className="text-[10px] text-gray-600 mt-1">9-model consensus</p>
        </div>
      </div>

      {/* Top Performers */}
      <div className="space-y-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Top Performers</p>
        {topAgents.map((agent, idx) => (
          <div
            key={agent.role}
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm w-5 text-center">{idx === 0 ? '★' : `${idx + 1}`}</span>
              <div>
                <p className="text-sm font-medium text-white">{agent.role}</p>
                <p className="text-[10px] text-gray-500 font-mono">{agent.model.split('/').pop()}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono text-white">{agent.reputation.toFixed(0)} rep</p>
              <p className="text-[10px] text-gray-500">{agent.accuracy.toFixed(0)}% acc</p>
            </div>
          </div>
        ))}
      </div>

      {/* Status */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-emerald-300/80 font-medium">System Active</span>
        </div>
        <span className="text-[10px] text-gray-500 font-mono">Base Mainnet</span>
      </div>
    </div>
  )
}
