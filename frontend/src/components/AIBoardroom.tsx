'use client'

import { useState, useCallback, useEffect, useRef } from 'react'

interface InitialStance {
  agentId: string
  role: string
  model: string
  vote: 'yes' | 'no'
  confidence: number
  reasoning: string
  keyEvidence: string
  stake: string
}

interface ChallengePair {
  challenger: string
  defender: string
  challengeArgument: string
  defenseResponse: string
}

interface ConvictionLock {
  agentId: string
  role: string
  originalVote: 'yes' | 'no'
  finalVote: 'yes' | 'no' | null
  decision: 'hold' | 'flip' | 'abstain'
  reasoning: string
  survivedChallenge: boolean
  weightMultiplier: number
}

interface TallyResult {
  holdCount: number
  flipCount: number
  abstainCount: number
  survivingYes: number
  survivingNo: number
  weightedPercentage: number
}

interface BoardroomVerdict {
  action: string
  approved: boolean
  finalPercentage: number
  orchestratorSummary: string
}

interface DemoScenario {
  id: string
  title: string
  proposal: string
  risk: 'low' | 'medium' | 'high'
  expectedOutcome: string
}

interface ActivityLogEntry {
  time: number
  text: string
  type: 'info' | 'stance' | 'challenge' | 'conviction' | 'verdict'
}

type Phase = 'idle' | 'gathering_evidence' | 'initial_stance' | 'challenge' | 'conviction_lock' | 'final_tally' | 'orchestrating' | 'complete'
type AgentStatus = 'waiting' | 'thinking' | 'voted_yes' | 'voted_no' | 'challenged' | 'hold' | 'flip' | 'abstain'

const AGENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  'market-analyst': { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' },
  'yield-researcher': { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400' },
  'risk-officer': { bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-400' },
  'sentiment-analyst': { bg: 'bg-pink-500/20', border: 'border-pink-500/40', text: 'text-pink-400' },
  'protocol-analyst': { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400' },
  'onchain-analyst': { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' },
  'technical-auditor': { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' },
  'macro-analyst': { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400' },
  'quant-strategist': { bg: 'bg-indigo-500/20', border: 'border-indigo-500/40', text: 'text-indigo-400' },
}

const SEAT_POSITIONS = [
  { top: '4%', left: '50%' },
  { top: '12%', left: '75%' },
  { top: '35%', left: '90%' },
  { top: '62%', left: '85%' },
  { top: '82%', left: '65%' },
  { top: '82%', left: '35%' },
  { top: '62%', left: '15%' },
  { top: '35%', left: '10%' },
  { top: '12%', left: '25%' },
]

const AGENT_IDS = [
  'market-analyst', 'yield-researcher', 'risk-officer',
  'sentiment-analyst', 'protocol-analyst', 'onchain-analyst',
  'technical-auditor', 'macro-analyst', 'quant-strategist',
]

const AGENT_NAMES: Record<string, string> = {
  'market-analyst': 'Market Analyst',
  'yield-researcher': 'Yield Researcher',
  'risk-officer': 'Risk Officer',
  'sentiment-analyst': 'Sentiment Analyst',
  'protocol-analyst': 'Protocol Analyst',
  'onchain-analyst': 'On-Chain Analyst',
  'technical-auditor': 'Technical Auditor',
  'macro-analyst': 'Macro Analyst',
  'quant-strategist': 'Quant Strategist',
}

const PHASE_LABELS: Record<Phase, string> = {
  idle: 'Ready',
  gathering_evidence: 'Gathering Evidence',
  initial_stance: 'Blind Stance',
  challenge: 'Cross-Examination',
  conviction_lock: 'Conviction Lock',
  final_tally: 'Final Tally',
  orchestrating: 'Orchestrator Verdict',
  complete: 'Complete',
}

const PHASE_ORDER: Phase[] = ['gathering_evidence', 'initial_stance', 'challenge', 'conviction_lock', 'final_tally', 'orchestrating']

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function ElapsedTimer({ startTime, running }: { startTime: number; running: boolean }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!running || !startTime) return
    const interval = setInterval(() => setElapsed(Date.now() - startTime), 1000)
    return () => clearInterval(interval)
  }, [startTime, running])

  if (!running && elapsed === 0) return null

  return (
    <span className="text-[10px] font-mono text-gray-500">
      {formatElapsed(elapsed)}
    </span>
  )
}

function AgentStatusBar({ statuses }: { statuses: Record<string, AgentStatus> }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {AGENT_IDS.map(id => {
        const status = statuses[id] || 'waiting'
        const colors = AGENT_COLORS[id]!
        const name = AGENT_NAMES[id]!.split(' ')[0]

        let dotClass = 'bg-gray-700 border-gray-600'
        let animation = ''
        let badge: React.ReactNode = null

        switch (status) {
          case 'thinking':
            dotClass = 'bg-blue-500/30 border-blue-400/50'
            animation = 'animate-pulse'
            break
          case 'voted_yes':
            dotClass = 'bg-emerald-500/30 border-emerald-400/50'
            badge = <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 text-[5px] flex items-center justify-center text-white font-bold">Y</span>
            break
          case 'voted_no':
            dotClass = 'bg-red-500/30 border-red-400/50'
            badge = <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 text-[5px] flex items-center justify-center text-white font-bold">N</span>
            break
          case 'challenged':
            dotClass = 'bg-amber-500/20 border-amber-400/50'
            animation = 'animate-ping-slow'
            break
          case 'hold':
            dotClass = 'bg-emerald-500/40 border-emerald-400/60'
            badge = <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-600 text-[5px] flex items-center justify-center text-white font-bold">H</span>
            break
          case 'flip':
            dotClass = 'bg-amber-500/40 border-amber-400/60'
            badge = <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-600 text-[5px] flex items-center justify-center text-white font-bold">F</span>
            break
          case 'abstain':
            dotClass = 'bg-gray-500/40 border-gray-400/60'
            badge = <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-gray-600 text-[5px] flex items-center justify-center text-white font-bold">A</span>
            break
        }

        return (
          <div key={id} className="flex flex-col items-center gap-0.5" title={`${name}: ${status}`}>
            <div className={`relative w-5 h-5 rounded-full border ${dotClass} ${animation} flex items-center justify-center`}>
              <span className={`text-[7px] font-bold ${colors.text}`}>{name?.charAt(0)}</span>
              {badge}
            </div>
            <span className="text-[7px] text-gray-600 hidden sm:block">{name}</span>
          </div>
        )
      })}
    </div>
  )
}

function PhaseProgress({ current, stanceCount, convictionCount, challengeInfo }: {
  current: Phase
  stanceCount: number
  convictionCount: number
  challengeInfo: string
}) {
  const currentIdx = PHASE_ORDER.indexOf(current)

  let statusText = PHASE_LABELS[current]
  if (current === 'initial_stance') statusText = `Waiting for blind stances... (${stanceCount}/9 received)`
  if (current === 'challenge') statusText = challengeInfo || 'Cross-examining...'
  if (current === 'conviction_lock') statusText = `Conviction lock: ${convictionCount}/9 decided`

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-0.5">
        {PHASE_ORDER.map((p, idx) => (
          <div key={p} className={`h-1.5 flex-1 rounded-full transition-all duration-700 ${
            idx < currentIdx ? 'bg-emerald-500' : idx === currentIdx ? 'bg-blue-500 animate-pulse' : 'bg-white/[0.06]'
          }`} />
        ))}
      </div>
      <p className="text-[11px] text-gray-400">{statusText}</p>
    </div>
  )
}

function ExpandableCard({ children, preview, defaultExpanded = false }: {
  children: React.ReactNode
  preview: React.ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div>
      {expanded ? children : preview}
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-[9px] text-blue-400 hover:text-blue-300 mt-1 transition-colors"
      >
        {expanded ? 'Show less' : 'Show full response'}
      </button>
    </div>
  )
}

function ActivityLog({ entries }: { entries: ActivityLogEntry[] }) {
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [entries.length])

  if (entries.length === 0) return null

  return (
    <div ref={logRef} className="max-h-[200px] overflow-y-auto space-y-0.5 p-2 rounded-lg bg-black/30 border border-white/5">
      {entries.map((entry, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[9px] font-mono text-gray-600 shrink-0 w-10">[{formatElapsed(entry.time)}]</span>
          <span className={`text-[9px] leading-relaxed ${
            entry.type === 'verdict' ? 'text-white font-medium' :
            entry.type === 'challenge' ? 'text-red-400' :
            entry.type === 'conviction' ? 'text-purple-400' :
            entry.type === 'stance' ? 'text-gray-300' :
            'text-gray-500'
          }`}>{entry.text}</span>
        </div>
      ))}
    </div>
  )
}

function AgentSeat({ agentId, index, stance, conviction, phase, isChallengePair, status }: {
  agentId: string
  index: number
  stance?: InitialStance
  conviction?: ConvictionLock
  phase: Phase
  isChallengePair: boolean
  status: AgentStatus
}) {
  const colors = AGENT_COLORS[agentId]!
  const pos = SEAT_POSITIONS[index]!
  const name = AGENT_NAMES[agentId]!.split(' ')[0]

  let borderColor = 'border-gray-700'
  let bgColor = 'bg-gray-800'
  let badge: React.ReactNode = null
  let pulseClass = ''

  if (status === 'thinking') pulseClass = 'animate-pulse'

  if (stance && !conviction) {
    bgColor = stance.vote === 'yes' ? colors.bg : 'bg-red-500/10'
    borderColor = stance.vote === 'yes' ? colors.border : 'border-red-500/30'
    badge = (
      <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold shadow-md ${
        stance.vote === 'yes' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
      }`}>{stance.vote === 'yes' ? 'Y' : 'N'}</div>
    )
  }

  if (conviction) {
    const d = {
      hold: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', label: 'H', labelBg: 'bg-emerald-500' },
      flip: { bg: 'bg-amber-500/20', border: 'border-amber-500/40', label: 'F', labelBg: 'bg-amber-500' },
      abstain: { bg: 'bg-gray-500/20', border: 'border-gray-500/40', label: 'A', labelBg: 'bg-gray-500' },
    }[conviction.decision]
    bgColor = d.bg
    borderColor = d.border
    badge = (
      <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold shadow-md ${d.labelBg} text-white`}>{d.label}</div>
    )
  }

  return (
    <div className="absolute transition-all duration-500" style={{ top: pos.top, left: pos.left, transform: 'translate(-50%, -50%)' }}>
      <div className="relative flex flex-col items-center">
        <div className={`relative w-9 h-9 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${bgColor} ${borderColor} ${pulseClass} ${
          isChallengePair ? 'ring-2 ring-red-400/50 scale-110' : ''
        }`}>
          <div className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-white/60" />
            <span className="w-1 h-1 rounded-full bg-white/60" />
          </div>
          {badge}
        </div>
        <div className={`w-7 h-4 sm:w-8 sm:h-5 -mt-1 rounded-b-lg border-x border-b transition-colors ${bgColor} ${borderColor}`} />
        {stance?.stake && stance.stake !== 'none' && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
            <span className="text-[6px] text-amber-400 font-bold uppercase">{stance.stake}</span>
          </div>
        )}
        <div className="mt-1 text-center">
          <p className={`text-[8px] sm:text-[9px] font-semibold ${colors.text}`}>{name}</p>
        </div>
      </div>
    </div>
  )
}

export function AIBoardroom({ profile }: { profile?: string }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [stances, setStances] = useState<InitialStance[]>([])
  const [challenges, setChallenges] = useState<ChallengePair[]>([])
  const [activePairs, setActivePairs] = useState<Set<string>>(new Set())
  const [convictions, setConvictions] = useState<ConvictionLock[]>([])
  const [tally, setTally] = useState<TallyResult | null>(null)
  const [verdict, setVerdict] = useState<BoardroomVerdict | null>(null)
  const [running, setRunning] = useState(false)
  const [sourceCount, setSourceCount] = useState(0)
  const [scenarios, setScenarios] = useState<DemoScenario[]>([])
  const [selectedScenario, setSelectedScenario] = useState('')
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({})
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([])
  const [startTime, setStartTime] = useState(0)
  const [challengeInfo, setChallengeInfo] = useState('')
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/boardroom/scenarios')
      .then(r => r.json())
      .then(d => { if (d.scenarios) setScenarios(d.scenarios) })
      .catch(() => {})
  }, [])

  function addLog(text: string, type: ActivityLogEntry['type'] = 'info') {
    const time = startTime ? Date.now() - startTime : 0
    setActivityLog(prev => [...prev, { time, text, type }])
  }

  function toggleExpand(id: string) {
    setExpandedCards(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const startSession = useCallback(() => {
    const now = Date.now()
    setRunning(true)
    setStartTime(now)
    setPhase('gathering_evidence')
    setStances([])
    setChallenges([])
    setActivePairs(new Set())
    setConvictions([])
    setTally(null)
    setVerdict(null)
    setSourceCount(0)
    setAgentStatuses(Object.fromEntries(AGENT_IDS.map(id => [id, 'waiting' as AgentStatus])))
    setActivityLog([])
    setChallengeInfo('')
    setExpandedCards(new Set())

    const params = new URLSearchParams()
    if (selectedScenario) params.set('scenario', selectedScenario)
    if (profile) params.set('profile', profile)

    const es = new EventSource(`/api/boardroom/stream?${params.toString()}`)

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        switch (data.type) {
          case 'phase':
            setPhase(data.phase as Phase)
            if (data.phase === 'initial_stance') {
              setAgentStatuses(Object.fromEntries(AGENT_IDS.map(id => [id, 'thinking' as AgentStatus])))
              setActivityLog(prev => [...prev, { time: Date.now() - now, text: 'Dispatching to 9 AI models for blind stance...', type: 'info' }])
            }
            if (data.phase === 'challenge') {
              setActivityLog(prev => [...prev, { time: Date.now() - now, text: 'Cross-examination phase begins', type: 'challenge' }])
            }
            if (data.phase === 'conviction_lock') {
              setAgentStatuses(prev => {
                const next = { ...prev }
                AGENT_IDS.forEach(id => { if (next[id] !== 'hold' && next[id] !== 'flip' && next[id] !== 'abstain') next[id] = 'thinking' })
                return next
              })
              setActivityLog(prev => [...prev, { time: Date.now() - now, text: 'Agents deciding final conviction...', type: 'info' }])
            }
            if (data.phase === 'orchestrating') {
              setActivityLog(prev => [...prev, { time: Date.now() - now, text: 'Orchestrator (Claude Sonnet) synthesizing verdict...', type: 'info' }])
            }
            break

          case 'evidence_ready':
            setSourceCount(data.sourceCount)
            setActivityLog(prev => [...prev, { time: Date.now() - now, text: `Evidence gathered (${data.sourceCount} live sources)`, type: 'info' }])
            break

          case 'stance':
            setStances(prev => [...prev, data.stance])
            setAgentStatuses(prev => ({ ...prev, [data.stance.agentId]: data.stance.vote === 'yes' ? 'voted_yes' : 'voted_no' }))
            setActivityLog(prev => [...prev, {
              time: Date.now() - now,
              text: `${data.stance.role} voted ${data.stance.vote.toUpperCase()} (${(data.stance.confidence * 100).toFixed(0)}% conf${data.stance.stake !== 'none' ? `, staked ${data.stance.stake.toUpperCase()}` : ''})`,
              type: 'stance',
            }])
            break

          case 'challenge_pair':
            setActivePairs(prev => new Set([...prev, data.pair.challenger, data.pair.defender]))
            setAgentStatuses(prev => ({ ...prev, [data.pair.challenger]: 'challenged', [data.pair.defender]: 'challenged' }))
            const cName = AGENT_NAMES[data.pair.challenger] || data.pair.challenger
            const dName = AGENT_NAMES[data.pair.defender] || data.pair.defender
            setChallengeInfo(`${cName} → ${dName}`)
            setActivityLog(prev => [...prev, { time: Date.now() - now, text: `${cName} challenges ${dName}`, type: 'challenge' }])
            break

          case 'challenge_result':
            setChallenges(prev => [...prev, data.pair])
            setActivityLog(prev => [...prev, { time: Date.now() - now, text: `${AGENT_NAMES[data.pair.defender] || data.pair.defender} defends position`, type: 'challenge' }])
            break

          case 'conviction':
            setConvictions(prev => [...prev, data.lock])
            setAgentStatuses(prev => ({ ...prev, [data.lock.agentId]: data.lock.decision as AgentStatus }))
            setActivityLog(prev => [...prev, {
              time: Date.now() - now,
              text: `${data.lock.role}: ${data.lock.decision.toUpperCase()}${data.lock.decision === 'flip' ? ` (${data.lock.originalVote}→${data.lock.finalVote})` : ''} — ${data.lock.reasoning.slice(0, 60)}`,
              type: 'conviction',
            }])
            break

          case 'tally':
            setTally(data.result)
            setActivityLog(prev => [...prev, {
              time: Date.now() - now,
              text: `Tally: ${data.result.holdCount} HOLD, ${data.result.flipCount} FLIP, ${data.result.abstainCount} ABSTAIN → ${(data.result.weightedPercentage * 100).toFixed(0)}% weighted conviction`,
              type: 'info',
            }])
            break

          case 'verdict':
            setVerdict(data.session.verdict)
            setPhase('complete')
            setRunning(false)
            setActivityLog(prev => [...prev, {
              time: Date.now() - now,
              text: `VERDICT: ${data.session.verdict.approved ? 'APPROVED' : 'REJECTED'} — ${data.session.verdict.action} (${(data.session.verdict.finalPercentage * 100).toFixed(0)}%)`,
              type: 'verdict',
            }])
            es.close()
            break

          case 'error':
            setRunning(false)
            setActivityLog(prev => [...prev, { time: Date.now() - now, text: `Error: ${data.message}`, type: 'info' }])
            es.close()
            break
        }
      } catch {}
    }

    es.onerror = () => {
      setRunning(false)
      es.close()
    }
  }, [selectedScenario, profile])

  return (
    <div className="space-y-4">
      {/* Header with timer */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wide">Adversarial Conviction Protocol</h2>
            <p className="text-[10px] text-gray-500">Blind stance → Cross-examination → Conviction lock → Verdict</p>
          </div>
          {running && <ElapsedTimer startTime={startTime} running={running} />}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedScenario}
            onChange={(e) => setSelectedScenario(e.target.value)}
            disabled={running}
            className="px-2.5 py-1.5 text-[10px] rounded-lg bg-white/[0.04] border border-white/[0.1] text-gray-300 disabled:opacity-50"
          >
            <option value="">Default: Supply USDC to Aave</option>
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          <button
            onClick={startSession}
            disabled={running}
            className="px-4 py-2 text-xs font-bold text-black bg-white hover:bg-gray-200 rounded-lg transition-all disabled:opacity-50"
          >
            {running ? 'Running...' : 'Start Session'}
          </button>
        </div>
      </div>

      {/* Agent Status Bar */}
      {phase !== 'idle' && (
        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
          <AgentStatusBar statuses={agentStatuses} />
        </div>
      )}

      {/* Phase Progress */}
      {phase !== 'idle' && (
        <PhaseProgress current={phase} stanceCount={stances.length} convictionCount={convictions.length} challengeInfo={challengeInfo} />
      )}

      {/* Main: Table + Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Meeting Table */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-4 relative min-h-[400px]">
          <div className="relative w-full aspect-square max-w-[450px] mx-auto">
            <div className="absolute inset-[22%] rounded-[50%] bg-gradient-to-b from-gray-800/40 to-gray-900/60 border border-white/[0.06] shadow-[inset_0_4px_30px_rgba(0,0,0,0.4)]">
              <div className="absolute inset-0 flex items-center justify-center p-4">
                {phase === 'idle' && <p className="text-[10px] text-gray-500">9 specialists ready</p>}
                {phase === 'gathering_evidence' && <p className="text-[10px] text-gray-400 animate-pulse">Scanning {sourceCount || '...'} sources</p>}
                {phase === 'initial_stance' && <div className="text-center"><p className="text-lg font-mono font-bold text-white">{stances.length}/9</p><p className="text-[9px] text-gray-500">stances</p></div>}
                {phase === 'challenge' && <div className="text-center"><p className="text-[9px] text-red-400 font-medium uppercase">Cross-Exam</p><p className="text-[8px] text-gray-500 mt-1">{challengeInfo}</p></div>}
                {phase === 'conviction_lock' && <div className="text-center"><p className="text-lg font-mono font-bold text-white">{convictions.length}/9</p><p className="text-[9px] text-gray-500">locked</p></div>}
                {(phase === 'final_tally' || phase === 'orchestrating') && tally && <div className="text-center"><p className={`text-xl font-bold font-mono ${tally.weightedPercentage >= 0.7 ? 'text-emerald-400' : 'text-red-400'}`}>{(tally.weightedPercentage * 100).toFixed(0)}%</p><p className="text-[8px] text-gray-500">conviction</p></div>}
                {phase === 'complete' && verdict && <div className="text-center"><p className={`text-xl font-bold ${verdict.approved ? 'text-emerald-400' : 'text-red-400'}`}>{verdict.approved ? 'APPROVED' : 'REJECTED'}</p><p className="text-[9px] text-gray-500 capitalize">{verdict.action}</p></div>}
              </div>
            </div>

            {AGENT_IDS.map((id, idx) => (
              <AgentSeat
                key={id}
                agentId={id}
                index={idx}
                stance={stances.find(s => s.agentId === id)}
                conviction={convictions.find(c => c.agentId === id)}
                phase={phase}
                isChallengePair={activePairs.has(id) && phase === 'challenge'}
                status={agentStatuses[id] || 'waiting'}
              />
            ))}
          </div>
        </div>

        {/* Details Panel */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.01] p-4 space-y-3 max-h-[550px] overflow-y-auto">
          {phase === 'idle' && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-sm text-gray-400">Select a scenario and start</p>
                <p className="text-[10px] text-gray-600 mt-1">Each agent stakes reputation on their conviction</p>
              </div>
            </div>
          )}

          {/* Stances with expandable */}
          {stances.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Stances ({stances.length}/9)</span>
                <span className="text-[10px] text-gray-600">
                  <span className="text-emerald-400">{stances.filter(s => s.vote === 'yes').length}Y</span> / <span className="text-red-400">{stances.filter(s => s.vote === 'no').length}N</span>
                </span>
              </div>
              {stances.map(s => {
                const c = AGENT_COLORS[s.agentId]!
                const isExpanded = expandedCards.has(`stance-${s.agentId}`)
                return (
                  <div key={s.agentId} className={`p-2 rounded-lg border animate-fade-in ${
                    s.vote === 'yes' ? 'bg-emerald-500/[0.03] border-emerald-500/10' : 'bg-red-500/[0.03] border-red-500/10'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-5 h-5 rounded-full ${c.bg} border ${c.border} flex items-center justify-center`}>
                        <span className={`text-[8px] font-bold ${c.text}`}>{s.role.charAt(0)}</span>
                      </div>
                      <span className="text-[10px] font-medium text-white">{s.role}</span>
                      <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${s.vote === 'yes' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.vote.toUpperCase()}</span>
                      {s.stake !== 'none' && <span className="text-[7px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400 uppercase">{s.stake}</span>}
                      <span className="text-[8px] text-gray-600 font-mono ml-auto">{(s.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className={`text-[9px] text-gray-400 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>{s.reasoning}</p>
                    {isExpanded && s.keyEvidence && (
                      <p className="text-[9px] text-gray-500 mt-1 italic">Key evidence: {s.keyEvidence}</p>
                    )}
                    {isExpanded && (
                      <p className="text-[8px] text-gray-600 mt-1 font-mono">Model: {s.model}</p>
                    )}
                    <button onClick={() => toggleExpand(`stance-${s.agentId}`)} className="text-[8px] text-blue-400 hover:text-blue-300 mt-1">
                      {isExpanded ? 'Less' : 'Full response'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Challenges with expandable */}
          {challenges.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <span className="text-[10px] text-red-400 uppercase tracking-wider font-medium">Cross-Examination ({challenges.length})</span>
              {challenges.map((pair, i) => {
                const isExpanded = expandedCards.has(`challenge-${i}`)
                const cName = AGENT_NAMES[pair.challenger] || pair.challenger
                const dName = AGENT_NAMES[pair.defender] || pair.defender
                return (
                  <div key={i} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 animate-fade-in">
                    <div className="flex items-center gap-1.5 text-[9px] mb-1.5">
                      <span className="text-red-400 font-medium">{cName}</span>
                      <span className="text-gray-600">→</span>
                      <span className="text-blue-400 font-medium">{dName}</span>
                    </div>
                    <div className="pl-2 border-l border-red-500/30 mb-1">
                      <p className={`text-[9px] text-gray-400 ${isExpanded ? '' : 'line-clamp-2'}`}>{pair.challengeArgument}</p>
                    </div>
                    <div className="pl-2 border-l border-blue-500/30">
                      <p className={`text-[9px] text-gray-400 ${isExpanded ? '' : 'line-clamp-2'}`}>{pair.defenseResponse}</p>
                    </div>
                    <button onClick={() => toggleExpand(`challenge-${i}`)} className="text-[8px] text-blue-400 hover:text-blue-300 mt-1">
                      {isExpanded ? 'Less' : 'Full exchange'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Convictions */}
          {convictions.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-white/5">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Conviction Locks ({convictions.length}/9)</span>
              {convictions.map(cv => {
                const isExpanded = expandedCards.has(`conv-${cv.agentId}`)
                return (
                  <div key={cv.agentId} className="p-2 rounded-lg bg-white/[0.02] border border-white/5 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase ${
                          cv.decision === 'hold' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : cv.decision === 'flip' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-gray-500/10 border-gray-500/20 text-gray-400'
                        }`}>{cv.decision}</span>
                        <span className="text-[10px] text-white">{cv.role}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {cv.decision === 'flip' && <span className="text-[9px] text-gray-500">{cv.originalVote}→{cv.finalVote}</span>}
                        {cv.decision === 'hold' && <span className="text-[9px] text-emerald-500 font-mono">{cv.weightMultiplier.toFixed(1)}x</span>}
                      </div>
                    </div>
                    {isExpanded && <p className="text-[9px] text-gray-400 mt-1">{cv.reasoning}</p>}
                    <button onClick={() => toggleExpand(`conv-${cv.agentId}`)} className="text-[8px] text-blue-400 hover:text-blue-300 mt-0.5">
                      {isExpanded ? 'Less' : 'Why'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Tally */}
          {tally && (
            <div className="pt-2 border-t border-white/5 space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-emerald-500/5"><p className="text-sm font-bold text-emerald-400">{tally.holdCount}</p><p className="text-[9px] text-gray-500">HOLD</p></div>
                <div className="p-2 rounded-lg bg-amber-500/5"><p className="text-sm font-bold text-amber-400">{tally.flipCount}</p><p className="text-[9px] text-gray-500">FLIP</p></div>
                <div className="p-2 rounded-lg bg-gray-500/5"><p className="text-sm font-bold text-gray-400">{tally.abstainCount}</p><p className="text-[9px] text-gray-500">ABSTAIN</p></div>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-1000 ${tally.weightedPercentage >= 0.7 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${tally.weightedPercentage * 100}%` }} />
              </div>
              <p className="text-center text-[10px] text-gray-500">Weighted: <span className="text-white font-mono">{(tally.weightedPercentage * 100).toFixed(0)}%</span> <span className="text-gray-600">(70% threshold)</span></p>
            </div>
          )}

          {/* Verdict */}
          {verdict && (
            <div className={`p-3 rounded-xl border ${verdict.approved ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-5 h-5 rounded-md bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-[8px] font-bold text-purple-400">O</span>
                <span className="text-[10px] font-semibold text-white">Orchestrator Verdict</span>
              </div>
              <p className="text-[11px] text-gray-300 leading-relaxed">{verdict.orchestratorSummary}</p>
              <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-500">
                <span>Action: <span className="text-white capitalize">{verdict.action}</span></span>
                <span className={verdict.approved ? 'text-emerald-400' : 'text-red-400'}>{verdict.approved ? 'Execute' : 'Hold'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Activity Log */}
      {activityLog.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Activity Log</span>
          <ActivityLog entries={activityLog} />
        </div>
      )}
    </div>
  )
}
