'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'

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

interface SessionDetail {
  id: string
  proposal: string
  domain: string
  trigger: string | null
  triggerData: unknown
  approved: boolean
  percentage: number | null
  weightedPercentage: number | null
  action: string | null
  orchestratorSummary: string | null
  date: string
  stances: Array<{
    agentId: string
    role: string
    model: string
    reputation: number
    vote: string
    confidence: number
    reasoning: string
    stakeLevel: string
    stakedAmount: number
    wasCorrect: boolean | null
    reputationDelta: number | null
    data: unknown
    compositeRisk: number | null
  }>
  challenges: Array<{
    challenger: string
    defender: string
    challengeArgument: string
    defenseResponse: string
  }>
  convictions: Array<{
    agentId: string
    role: string
    originalVote: string
    finalVote: string | null
    decision: string
    reasoning: string
    weightMultiplier: number
  }>
  execution: { executed?: boolean; txHash?: string; timestamp?: number } | null
  outcome: { result: string; valueDelta: number | null; measuredAt: string | null } | null
  caseLaw: { domain: string; riskLevel: string; lessonSummary: string | null; outcome: string | null } | null
}

type Filter = 'all' | 'approved' | 'rejected'

const AGENT_COLORS: Record<string, string> = {
  'market-analyst': 'text-blue-400',
  'yield-researcher': 'text-cyan-400',
  'risk-officer': 'text-red-400',
  'sentiment-analyst': 'text-pink-400',
  'protocol-analyst': 'text-emerald-400',
  'onchain-analyst': 'text-purple-400',
  'technical-auditor': 'text-amber-400',
  'macro-analyst': 'text-orange-400',
  'quant-strategist': 'text-indigo-400',
}

export function SessionHistory() {
  const { address } = useAccount()
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

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

  async function loadDetail(id: string) {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return }
    setExpandedId(id)
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/sessions/${id}`)
      if (!r.ok) return
      setDetail(await r.json())
    } catch {} finally { setDetailLoading(false) }
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
            <div key={s.id}>
              {/* Collapsed card */}
              <button onClick={() => loadDetail(s.id)} className={`w-full text-left p-3 rounded-xl border transition-all ${
                expandedId===s.id ? 'bg-white/[0.04] border-white/10' : 'bg-white/[0.02] border-white/5 hover:border-white/10'
              }`}>
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

              {/* Expanded detail */}
              {expandedId === s.id && (
                <div className="mt-1 p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-4 animate-fade-in">
                  {detailLoading ? (
                    <div className="text-center py-8"><span className="text-[10px] text-gray-500 animate-pulse">Loading full audit...</span></div>
                  ) : detail ? (
                    <>
                      {/* Trigger */}
                      {detail.trigger && (
                        <div>
                          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Trigger</span>
                          <p className="text-[11px] text-gray-300 mt-0.5">{detail.trigger}</p>
                        </div>
                      )}

                      {/* Proposal */}
                      <div>
                        <span className="text-[9px] text-gray-500 uppercase tracking-wider">Proposal</span>
                        <p className="text-[11px] text-gray-300 mt-0.5">{detail.proposal}</p>
                      </div>

                      {/* Stances */}
                      <div>
                        <span className="text-[9px] text-gray-500 uppercase tracking-wider">Initial Stances ({detail.stances.length} agents)</span>
                        <div className="space-y-1.5 mt-1.5">
                          {detail.stances.map(st => (
                            <div key={st.agentId} className={`p-2 rounded-lg border ${st.vote==='yes'?'bg-emerald-500/[0.03] border-emerald-500/10':'bg-red-500/[0.03] border-red-500/10'}`}>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-[10px] font-medium ${AGENT_COLORS[st.agentId]||'text-gray-400'}`}>{st.role}</span>
                                <span className={`text-[8px] px-1 py-0.5 rounded font-bold ${st.vote==='yes'?'bg-emerald-500/20 text-emerald-400':'bg-red-500/20 text-red-400'}`}>{st.vote.toUpperCase()}</span>
                                <span className="text-[8px] text-gray-600 font-mono">{(st.confidence*100).toFixed(0)}% conf</span>
                                {st.stakeLevel!=='none' && <span className="text-[7px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase">{st.stakeLevel}</span>}
                                <span className="text-[8px] text-gray-700 font-mono ml-auto">{st.model.split('/').pop()}</span>
                              </div>
                              <p className="text-[9px] text-gray-400 leading-relaxed">{st.reasoning}</p>
                              {st.wasCorrect !== null && (
                                <span className={`text-[8px] mt-0.5 inline-block ${st.wasCorrect?'text-emerald-500':'text-red-500'}`}>
                                  {st.wasCorrect?'Correct':'Incorrect'}{st.reputationDelta?` (${st.reputationDelta>0?'+':''}${st.reputationDelta.toFixed(1)} rep)`:''}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Challenges */}
                      {detail.challenges.length > 0 && (
                        <div>
                          <span className="text-[9px] text-red-400 uppercase tracking-wider font-medium">Cross-Examination ({detail.challenges.length} pairs)</span>
                          <div className="space-y-2 mt-1.5">
                            {detail.challenges.map((c, i) => (
                              <div key={i} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                                <div className="text-[9px] text-gray-500 mb-1">
                                  <span className="text-red-400">{c.challenger}</span> → <span className="text-blue-400">{c.defender}</span>
                                </div>
                                <div className="pl-2 border-l-2 border-red-500/30 mb-1.5">
                                  <p className="text-[9px] text-gray-300 leading-relaxed">{c.challengeArgument}</p>
                                </div>
                                <div className="pl-2 border-l-2 border-blue-500/30">
                                  <p className="text-[9px] text-gray-300 leading-relaxed">{c.defenseResponse}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Convictions */}
                      {detail.convictions.length > 0 && (
                        <div>
                          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Conviction Locks ({detail.convictions.length})</span>
                          <div className="space-y-1 mt-1.5">
                            {detail.convictions.map(cv => (
                              <div key={cv.agentId} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5">
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase shrink-0 ${
                                  cv.decision==='hold'?'bg-emerald-500/10 border-emerald-500/20 text-emerald-400':
                                  cv.decision==='flip'?'bg-amber-500/10 border-amber-500/20 text-amber-400':
                                  'bg-gray-500/10 border-gray-500/20 text-gray-400'
                                }`}>{cv.decision}</span>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-white">{cv.role}</span>
                                    {cv.decision==='flip' && <span className="text-[8px] text-gray-500">{cv.originalVote}→{cv.finalVote}</span>}
                                    <span className="text-[8px] text-gray-600 font-mono">{cv.weightMultiplier.toFixed(1)}x</span>
                                  </div>
                                  <p className="text-[9px] text-gray-400 mt-0.5">{cv.reasoning}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Orchestrator */}
                      <div className={`p-3 rounded-xl border ${detail.approved?'bg-emerald-500/5 border-emerald-500/20':'bg-red-500/5 border-red-500/20'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold text-white">Orchestrator Verdict</span>
                          <span className="text-[8px] text-purple-400 font-mono">Claude Sonnet 4.5</span>
                        </div>
                        <p className="text-[10px] text-gray-300 leading-relaxed">{detail.orchestratorSummary}</p>
                        <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-500">
                          <span>Action: <span className="text-white capitalize">{detail.action}</span></span>
                          <span>Weighted: <span className="text-white">{detail.weightedPercentage ? (detail.weightedPercentage*100).toFixed(0)+'%' : 'N/A'}</span></span>
                        </div>
                      </div>

                      {/* Execution */}
                      {detail.execution && (
                        <div className="p-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20">
                          <span className="text-[9px] text-purple-400 uppercase tracking-wider font-medium">On-Chain Execution</span>
                          <div className="flex items-center gap-3 mt-1 text-[10px]">
                            {String((detail.execution as Record<string,unknown>)?.txHash || '') !== '' && (
                              <a href={`https://basescan.org/tx/${String((detail.execution as Record<string,unknown>).txHash)}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-mono">
                                {String((detail.execution as Record<string,unknown>).txHash).slice(0,14)}...
                              </a>
                            )}
                            <span className="text-gray-500">via 1Shot Relayer • Base Mainnet</span>
                          </div>
                        </div>
                      )}

                      {/* Outcome */}
                      {detail.outcome && (
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Measured Outcome</span>
                          <div className="flex items-center gap-3 mt-1 text-[10px]">
                            <span className={detail.outcome.result==='profit'?'text-emerald-400':detail.outcome.result==='loss'?'text-red-400':'text-gray-400'}>{detail.outcome.result.toUpperCase()}</span>
                            {detail.outcome.valueDelta && <span className="text-white font-mono">{detail.outcome.valueDelta>0?'+':''}${detail.outcome.valueDelta.toFixed(2)}</span>}
                          </div>
                        </div>
                      )}

                      {/* Case Law */}
                      {detail.caseLaw?.lessonSummary && (
                        <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
                          <span className="text-[9px] text-gray-500 uppercase tracking-wider">Lesson Learned</span>
                          <p className="text-[10px] text-gray-300 mt-0.5 italic">{detail.caseLaw.lessonSummary}</p>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              )}
            </div>
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
