'use client'

import { useState, useEffect, useCallback } from 'react'

type AgentRole = 'commander' | 'scout' | 'trader' | 'rebalancer'

interface ActivityEntry {
  id: string
  timestamp: string
  agent: AgentRole
  action: string
  reasoning?: string
  txHash?: string
}

const AGENT_STYLES: Record<AgentRole, { dot: string; badge: string; label: string }> = {
  commander: {
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    label: 'Commander',
  },
  scout: {
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    label: 'Scout',
  },
  trader: {
    dot: 'bg-violet-400',
    badge: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
    label: 'Trader',
  },
  rebalancer: {
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    label: 'Rebalancer',
  },
}

function formatRelativeTime(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffSeconds = Math.floor((now - then) / 1000)

  if (diffSeconds < 60) return `${diffSeconds}s ago`
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`
  return `${Math.floor(diffSeconds / 86400)}d ago`
}

function truncateHash(hash: string): string {
  if (hash.length <= 12) return hash
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`
}

interface ActivityItemProps {
  entry: ActivityEntry
  index: number
}

function ActivityItem({ entry, index }: ActivityItemProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const style = AGENT_STYLES[entry.agent] || AGENT_STYLES.commander

  return (
    <div
      className="group py-3 px-3 rounded-lg hover:bg-white/[0.03] transition-all duration-200 animate-slide-in-right"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start gap-3">
        {/* Agent dot */}
        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${style.dot}`} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${style.badge}`}>
              {style.label}
            </span>
            <span className="text-[10px] text-gray-600 font-mono">
              {formatRelativeTime(entry.timestamp)}
            </span>
          </div>

          <p className="text-xs text-gray-300 leading-relaxed">{entry.action}</p>

          {/* Tx Hash */}
          {entry.txHash && (
            <a
              href={`https://basescan.org/tx/${entry.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {truncateHash(entry.txHash)}
            </a>
          )}

          {/* Reasoning Toggle */}
          {entry.reasoning && (
            <>
              <button
                onClick={() => setIsExpanded(prev => !prev)}
                className="block mt-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                {isExpanded ? 'Hide reasoning' : 'Show AI reasoning'}
              </button>

              {isExpanded && (
                <div className="mt-2 p-3 rounded-lg bg-white/[0.03] border border-white/5">
                  <p className="text-[11px] text-gray-400 leading-relaxed italic">
                    {entry.reasoning}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface ActivityFeedProps {
  compact?: boolean
}

export function ActivityFeed({ compact = false }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/activity')
      if (res.ok) {
        const data = await res.json()
        setEntries(Array.isArray(data) ? data : data.entries || [])
      }
    } catch {
      // Silently fail on polling errors
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivity()
    const interval = setInterval(fetchActivity, 5000)
    return () => clearInterval(interval)
  }, [fetchActivity])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-14 bg-white/[0.03] rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
          <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-500 text-xs">No agent activity yet.</p>
        <p className="text-gray-600 text-[10px] mt-1">Grant permissions to start.</p>
      </div>
    )
  }

  const displayEntries = compact ? entries.slice(0, 5) : entries

  return (
    <div className={`${compact ? 'max-h-80' : 'max-h-[600px]'} overflow-y-auto space-y-0.5`}>
      {displayEntries.map((entry, idx) => (
        <ActivityItem key={entry.id} entry={entry} index={idx} />
      ))}
    </div>
  )
}
