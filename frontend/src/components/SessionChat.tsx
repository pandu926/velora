'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AGENT_FULL_NAMES, AGENT_COLORS } from '@/lib/agent-constants'

interface ChatMessage {
  agentId: string
  role: string
  model: string
  type: 'stance' | 'flip' | 'hold' | 'verdict'
  content: string
  vote?: 'yes' | 'no'
  confidence?: number
  replyTo?: string
  round?: number
  timestamp: number
}

interface SessionData {
  id: string
  proposal: string
  verdictAction: string
  approved: boolean
  percentage: number
  summary: string
  totalRounds: number
  chatMessages: ChatMessage[] | null
  stances: Array<{
    agentId: string
    role: string
    model: string
    vote: string
    confidence: number
    reasoning: string
  }>
  execution: { executed?: boolean; txHash?: string } | null
  createdAt: string
}

function getAgentColor(agentId: string) {
  return AGENT_COLORS[agentId] ?? { bg: 'bg-gray-500/20', border: 'border-gray-500/50', text: 'text-gray-400', glow: '', blob: '' }
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function VoteBadge({ vote, confidence }: { vote?: string; confidence?: number }) {
  if (!vote) return null
  const isYes = vote === 'yes'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${isYes ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
      {isYes ? '✓ YES' : '✗ NO'}
      {confidence !== undefined && confidence > 0 && <span className="opacity-70">{(confidence * 100).toFixed(0)}%</span>}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  if (type === 'stance') return null
  const styles: Record<string, string> = {
    flip: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    hold: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    verdict: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  }
  const labels: Record<string, string> = { flip: 'FLIPPED', hold: 'HOLDS', verdict: 'VERDICT' }
  return (
    <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold border ${styles[type] ?? 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
      {labels[type] ?? type.toUpperCase()}
    </span>
  )
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const colors = getAgentColor(msg.agentId)
  const isVerdict = msg.type === 'verdict'
  const agentName = AGENT_FULL_NAMES[msg.agentId] ?? msg.role
  const replyToName = msg.replyTo ? (AGENT_FULL_NAMES[msg.replyTo] ?? msg.replyTo) : null

  if (isVerdict) {
    return (
      <div className="mx-4 my-3 p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-amber-500/10 border border-purple-500/20">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-amber-500 flex items-center justify-center text-[10px] font-bold text-white">V</span>
          <span className="text-xs font-semibold text-purple-300">Venice AI — Final Verdict</span>
          <VoteBadge vote={msg.vote} confidence={msg.confidence} />
        </div>
        <p className="text-sm text-gray-200 leading-relaxed">{msg.content}</p>
      </div>
    )
  }

  return (
    <div className="mx-4 my-2">
      {replyToName && (
        <div className="ml-12 mb-1 flex items-center gap-1 text-[9px] text-gray-500">
          <span>↩</span>
          <span>replying to <span className={getAgentColor(msg.replyTo!).text}>{replyToName}</span></span>
        </div>
      )}
      <div className="flex gap-3">
        <div className={`w-9 h-9 shrink-0 rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center`}>
          <span className={`text-[10px] font-bold ${colors.text}`}>{agentName.split(' ').map(w => w[0]).join('').slice(0, 2)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-semibold ${colors.text}`}>{agentName}</span>
            <span className="text-[9px] text-gray-600 font-mono">{msg.model}</span>
            <VoteBadge vote={msg.vote} confidence={msg.confidence} />
            <TypeBadge type={msg.type} />
          </div>
          <div className={`p-3 rounded-xl rounded-tl-sm bg-white/[0.03] border border-white/[0.06]`}>
            <p className="text-[13px] text-gray-300 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          </div>
          <span className="text-[8px] text-gray-600 mt-0.5 block">{formatTime(msg.timestamp)}</span>
        </div>
      </div>
    </div>
  )
}

function RoundDivider({ round }: { round: number }) {
  return (
    <div className="flex items-center gap-3 mx-4 my-4">
      <div className="flex-1 h-px bg-white/[0.06]" />
      <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Persuasion Round {round}</span>
      <div className="flex-1 h-px bg-white/[0.06]" />
    </div>
  )
}

function buildFallbackMessages(stances: SessionData['stances']): ChatMessage[] {
  return stances.map((s, i) => ({
    agentId: s.agentId,
    role: s.role,
    model: s.model,
    type: 'stance' as const,
    content: s.reasoning,
    vote: s.vote as 'yes' | 'no',
    confidence: s.confidence,
    timestamp: Date.now() - (stances.length - i) * 5000,
  }))
}

export function SessionChat({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [session, setSession] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/sessions/${sessionId}`)
        if (!r.ok) return
        const d = await r.json()
        setSession(d)
      } catch { /* */ }
      finally { setLoading(false) }
    }
    load()
  }, [sessionId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>Session not found</p>
        <button onClick={() => router.back()} className="mt-4 text-blue-400 text-sm hover:underline">← Go back</button>
      </div>
    )
  }

  const messages: ChatMessage[] = session.chatMessages ?? buildFallbackMessages(session.stances)

  const groupedMessages: Array<ChatMessage | { type: 'round_divider'; round: number }> = []
  let lastRound = 0
  for (const msg of messages) {
    if (msg.round && msg.round > lastRound) {
      groupedMessages.push({ type: 'round_divider', round: msg.round })
      lastRound = msg.round
    }
    groupedMessages.push(msg)
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-xl bg-gray-950/80 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center justify-between">
          <button onClick={() => router.push('/app')} className="text-gray-400 hover:text-white text-sm transition-colors">← Back</button>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold ${session.approved ? 'text-emerald-400' : 'text-red-400'}`}>
              {session.approved ? '✓ APPROVED' : '✗ REJECTED'}
            </span>
            <span className="text-[10px] text-gray-500">{(session.percentage * 100).toFixed(0)}%</span>
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-1 truncate">{session.proposal}</p>
      </div>

      {/* Proposal System Message */}
      <div className="mx-4 my-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Proposal</p>
        <p className="text-sm text-gray-300">{session.proposal}</p>
        <p className="text-[9px] text-gray-600 mt-2">{new Date(session.createdAt).toLocaleString()}</p>
      </div>

      {/* Chat Messages */}
      <div ref={scrollRef} className="pb-4">
        {groupedMessages.map((item, i) => {
          if ('type' in item && item.type === 'round_divider') {
            return <RoundDivider key={`divider-${i}`} round={item.round} />
          }
          return <ChatBubble key={i} msg={item as ChatMessage} />
        })}
      </div>

      {/* Execution Footer */}
      {session.execution?.txHash && (
        <div className="mx-4 mb-6 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-[10px]">⟡</span>
            <span className="text-xs text-emerald-400 font-medium">Executed on Base</span>
          </div>
          <a href={`https://basescan.org/tx/${session.execution.txHash}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-400 hover:text-blue-300 font-mono">
            {session.execution.txHash.slice(0, 10)}...
          </a>
        </div>
      )}
    </div>
  )
}
