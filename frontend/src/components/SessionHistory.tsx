'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useRouter } from 'next/navigation'

interface SessionSummary {
  id: string
  proposal: string
  domain: string
  trigger: string | null
  approved: boolean
  percentage: number | null
  weightedPercentage: number | null
  action: string | null
  summary: string | null
  executed: boolean
  txHash: string | null
  yesCount: number
  noCount: number
  stakedCount: number
  date: string
}

type Filter = 'all' | 'approved' | 'rejected'

export function SessionHistory() {
  const { address } = useAccount()
  const router = useRouter()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchSessions() }, [page, filter, address])

  async function fetchSessions() {
    setLoading(true)
    try {
      const userParam = address ? `&user=${address}` : ''
      const r = await fetch(`/api/sessions?page=${page}&limit=20&filter=${filter}${userParam}`)
      if (!r.ok) return
      const d = await r.json()
      setSessions(d.sessions)
      setTotal(d.total)
    } catch {} finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">Session History</h2>
          <p className="text-[10px] text-gray-500">{total} deliberations — full audit trail</p>
        </div>
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white/[0.04] border border-white/10">
          {(['all','approved','rejected'] as Filter[]).map(f => (
            <button key={f} onClick={() => { setFilter(f); setPage(1) }}
              className={`px-2.5 py-1 text-[10px] rounded-md capitalize transition-all ${filter===f?'bg-white/10 text-white':'text-gray-500 hover:text-gray-300'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Session List */}
      {loading ? (
        <div className="space-y-2">{Array.from({length:5}).map((_,i)=><div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse"/>)}</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-400">No sessions yet</p>
          <p className="text-[10px] text-gray-600 mt-1">Start autopilot to generate deliberation sessions</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <button key={s.id} onClick={() => router.push(`/app/sessions/${s.id}`)} className="w-full text-left p-3 rounded-xl border transition-all bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
                    s.approved?'bg-emerald-500/10 border-emerald-500/20 text-emerald-400':'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>{s.approved?'APPROVED':'REJECTED'}</span>
                  <span className="text-[11px] text-white">{s.trigger?.replace('_',' ') || s.domain}</span>
                  {s.executed && <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">Executed</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] text-gray-500 font-mono">{s.yesCount}Y/{s.noCount}N</span>
                  {s.stakedCount > 0 && <span className="text-[8px] text-amber-400">{s.stakedCount} staked</span>}
                  <span className="text-[9px] text-gray-600">{new Date(s.date).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                </div>
              </div>
              <p className="text-[9px] text-gray-500 mt-1 line-clamp-1">{s.proposal}</p>
            </button>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} className="px-3 py-1 text-[10px] rounded bg-white/5 text-gray-400 disabled:opacity-30">Prev</button>
          <span className="text-[10px] text-gray-500">Page {page} of {Math.ceil(total/20)}</span>
          <button onClick={()=>setPage(p=>p+1)} disabled={page>=Math.ceil(total/20)} className="px-3 py-1 text-[10px] rounded bg-white/5 text-gray-400 disabled:opacity-30">Next</button>
        </div>
      )}
    </div>
  )
}
