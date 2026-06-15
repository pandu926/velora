'use client'

import { useState, useEffect } from 'react'

interface EvolutionEvent {
  cycleNumber: number
  replacedAgentId: string
  replacedModel: string
  newAgentId: string
  newModel: string
  reason: string
  performanceBefore: number
  performanceAfter: number | null
  createdAt: string
}

interface EvolutionStatus {
  shouldTrigger: boolean
  agents: Array<{
    id: string
    role: string
    model: string
    reputation: number
    compositeScore: number
    declining: boolean
  }>
}

const BACKEND_URL = ''

export function EvolutionTimeline() {
  const [history, setHistory] = useState<EvolutionEvent[]>([])
  const [status, setStatus] = useState<EvolutionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)

  useEffect(() => {
    Promise.all([fetchHistory(), fetchStatus()]).finally(() => setLoading(false))
  }, [])

  async function fetchHistory() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/economy/evolution/history`)
      if (!res.ok) return
      const data = await res.json() as { history: EvolutionEvent[] }
      setHistory(data.history)
    } catch {
      // silent
    }
  }

  async function fetchStatus() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/economy/evolution/status`)
      if (!res.ok) return
      const data = await res.json() as EvolutionStatus
      setStatus(data)
    } catch {
      // silent
    }
  }

  async function triggerEvolution() {
    setTriggering(true)
    try {
      const res = await fetch(`${BACKEND_URL}/api/economy/evolution/run`, { method: 'POST' })
      if (res.ok) {
        await Promise.all([fetchHistory(), fetchStatus()])
      }
    } catch {
      // silent
    } finally {
      setTriggering(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    )
  }

  const bottomAgents = status?.agents.slice(0, 2) ?? []
  const sessionsUntilTrigger = status?.shouldTrigger ? 0 : 30

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
            Natural Selection
          </h3>
        </div>
        {status?.shouldTrigger && (
          <button
            onClick={triggerEvolution}
            disabled={triggering}
            className="px-3 py-1.5 text-[11px] font-medium rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          >
            {triggering ? 'Evolving...' : 'Trigger Evolution'}
          </button>
        )}
      </div>

      {/* Status Card */}
      <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-gray-400">Evolution Status</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
            status?.shouldTrigger
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'bg-white/5 text-gray-500 border border-white/10'
          }`}>
            {status?.shouldTrigger ? 'Ready to Trigger' : `${sessionsUntilTrigger} sessions until next`}
          </span>
        </div>

        {bottomAgents.length > 0 && (
          <div className="mt-2 space-y-1.5">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">At-Risk Agents</span>
            {bottomAgents.map(agent => (
              <div key={agent.id} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${agent.declining ? 'bg-red-400' : agent.reputation <= 35 ? 'bg-amber-400' : 'bg-gray-600'}`} />
                  <span className="text-[11px] text-gray-300">{agent.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 font-mono">{agent.compositeScore.toFixed(1)}</span>
                  {agent.declining && (
                    <span className="text-[9px] text-red-400 border border-red-500/20 px-1 rounded">declining</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      {history.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs text-gray-500">No evolution events yet</p>
          <p className="text-[10px] text-gray-600 mt-1">First cycle triggers after 30 measured outcomes</p>
        </div>
      ) : (
        <div className="space-y-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Evolution History</span>
          {history.map((event, idx) => (
            <div key={idx} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-purple-400 font-medium">Cycle #{event.cycleNumber}</span>
                <span className="text-[10px] text-gray-600">
                  {new Date(event.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-red-400 line-through font-mono">{event.replacedModel.split('/').pop()}</span>
                <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="text-emerald-400 font-mono">{event.newModel.split('/').pop()}</span>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-[10px] text-gray-500">Score: {event.performanceBefore.toFixed(1)}</span>
                {event.performanceAfter !== null && (
                  <span className={`text-[10px] ${event.performanceAfter > event.performanceBefore ? 'text-emerald-400' : 'text-red-400'}`}>
                    → {event.performanceAfter.toFixed(1)}
                  </span>
                )}
                <span className="text-[10px] text-gray-600 italic">{event.reason.split(':')[0]}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
