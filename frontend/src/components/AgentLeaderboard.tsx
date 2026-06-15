'use client'

import { useState, useEffect } from 'react'

interface AgentRanking {
  id: string
  role: string
  model: string
  reputation: number
  accuracy: number
  totalSessions: number
  weight: number
}

interface Specialization {
  domain: string
  accuracy: number
  sampleSize: number
  confidence: number
}

const BACKEND_URL = ''

function ReputationBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100)
  const color = value >= 70 ? 'bg-emerald-500' : value >= 50 ? 'bg-blue-500' : value >= 30 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function WeightBadge({ weight }: { weight: number }) {
  const color = weight >= 1.5 ? 'text-emerald-400 border-emerald-500/30' : weight >= 1.0 ? 'text-blue-400 border-blue-500/30' : 'text-amber-400 border-amber-500/30'
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${color}`}>
      {weight.toFixed(2)}x
    </span>
  )
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm">&#9733;</span>
  if (rank === 2) return <span className="text-xs text-gray-400">2nd</span>
  if (rank === 3) return <span className="text-xs text-gray-500">3rd</span>
  return <span className="text-xs text-gray-600">{rank}th</span>
}

export function AgentLeaderboard() {
  const [agents, setAgents] = useState<AgentRanking[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [specializations, setSpecializations] = useState<Specialization[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (selectedAgent) fetchSpecializations(selectedAgent)
  }, [selectedAgent])

  async function fetchLeaderboard() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/economy/leaderboard`)
      if (!res.ok) return
      const data = await res.json() as { agents: AgentRanking[] }
      setAgents(data.agents)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }

  async function fetchSpecializations(agentId: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/economy/specializations/${agentId}`)
      if (!res.ok) return
      const data = await res.json() as { specializations: Specialization[] }
      setSpecializations(data.specializations)
    } catch {
      setSpecializations([])
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-400" />
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Agent Reputation Leaderboard
          </h3>
        </div>
        <span className="text-[10px] text-gray-500">{agents.length} agents active</span>
      </div>

      {agents.map((agent, idx) => (
        <button
          key={agent.id}
          onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
          className={`w-full text-left p-3 rounded-xl border transition-all duration-200 ${
            selectedAgent === agent.id
              ? 'bg-white/5 border-purple-500/30'
              : 'bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-7 text-center shrink-0">
              <RankBadge rank={idx + 1} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white truncate">{agent.role}</span>
                <WeightBadge weight={agent.weight} />
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] text-gray-500 font-mono truncate">{agent.model.split('/').pop()}</span>
                <span className="text-[10px] text-gray-500">{agent.totalSessions} sessions</span>
                <span className="text-[10px] text-gray-500">{agent.accuracy.toFixed(0)}% acc</span>
              </div>
              <div className="mt-1.5">
                <ReputationBar value={agent.reputation} />
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold text-white">{agent.reputation.toFixed(0)}</div>
              <div className="text-[9px] text-gray-500 uppercase">rep</div>
            </div>
          </div>

          {selectedAgent === agent.id && (
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-2">Domain Specializations</div>
              {specializations.length === 0 ? (
                <p className="text-xs text-gray-600">No specialization data yet — needs outcome measurements</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {specializations.map(spec => (
                    <div key={spec.domain} className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-gray-300 capitalize">{spec.domain}</span>
                        <span className={`text-[10px] font-mono ${spec.accuracy >= 0.6 ? 'text-emerald-400' : spec.accuracy >= 0.4 ? 'text-gray-400' : 'text-red-400'}`}>
                          {(spec.accuracy * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${spec.accuracy >= 0.6 ? 'bg-emerald-500/60' : 'bg-gray-600'}`}
                            style={{ width: `${spec.accuracy * 100}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-600">{spec.sampleSize}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
