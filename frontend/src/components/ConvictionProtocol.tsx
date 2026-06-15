'use client'

import { useState, useCallback } from 'react'

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

type Phase = 'idle' | 'gathering_evidence' | 'initial_stance' | 'challenge' | 'conviction_lock' | 'final_tally' | 'orchestrating' | 'complete'

interface ConvictionProtocolProps {
  scenario?: string
  proposal?: string
  profile?: string
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

function PhaseProgress({ currentPhase }: { currentPhase: Phase }) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase)

  return (
    <div className="flex items-center gap-1 mb-5">
      {PHASE_ORDER.map((phase, idx) => {
        const isActive = phase === currentPhase
        const isDone = idx < currentIdx
        return (
          <div key={phase} className="flex items-center gap-1 flex-1">
            <div className={`h-1 flex-1 rounded-full transition-all duration-500 ${
              isDone ? 'bg-emerald-500' : isActive ? 'bg-blue-500 animate-pulse' : 'bg-white/5'
            }`} />
          </div>
        )
      })}
    </div>
  )
}

function StanceCard({ stance }: { stance: InitialStance }) {
  return (
    <div className={`p-3 rounded-xl border transition-all ${
      stance.vote === 'yes' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
    }`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-white">{stance.role}</span>
        <div className="flex items-center gap-2">
          {stance.stake !== 'none' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 uppercase">
              {stance.stake} stake
            </span>
          )}
          <span className={`text-xs font-bold ${stance.vote === 'yes' ? 'text-emerald-400' : 'text-red-400'}`}>
            {stance.vote.toUpperCase()}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">{stance.reasoning.slice(0, 150)}</p>
      {stance.keyEvidence && (
        <p className="text-[10px] text-gray-600 mt-1 italic">Key: {stance.keyEvidence.slice(0, 80)}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[10px] text-gray-500 font-mono">{stance.model.split('/').pop()}</span>
        <span className="text-[10px] text-gray-600">{(stance.confidence * 100).toFixed(0)}% conf</span>
      </div>
    </div>
  )
}

function ChallengeCard({ pair, agents }: { pair: ChallengePair; agents: InitialStance[] }) {
  const challengerAgent = agents.find(a => a.agentId === pair.challenger)
  const defenderAgent = agents.find(a => a.agentId === pair.defender)

  return (
    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-2">
      <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wider">
        <span className="text-red-400">{challengerAgent?.role ?? pair.challenger}</span>
        <svg className="w-3 h-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
        <span className="text-blue-400">{defenderAgent?.role ?? pair.defender}</span>
      </div>
      <div className="pl-3 border-l-2 border-red-500/30">
        <p className="text-[11px] text-gray-300">{pair.challengeArgument.slice(0, 200)}</p>
      </div>
      <div className="pl-3 border-l-2 border-blue-500/30">
        <p className="text-[11px] text-gray-300">{pair.defenseResponse.slice(0, 200)}</p>
      </div>
    </div>
  )
}

function ConvictionCard({ lock }: { lock: ConvictionLock }) {
  const decisionColors = {
    hold: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    flip: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    abstain: 'bg-gray-500/10 border-gray-500/20 text-gray-400',
  }

  return (
    <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
      <div className="flex items-center gap-2">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase ${decisionColors[lock.decision]}`}>
          {lock.decision}
        </span>
        <span className="text-xs text-white">{lock.role}</span>
      </div>
      <div className="flex items-center gap-2">
        {lock.decision === 'flip' && (
          <span className="text-[10px] text-gray-500">
            {lock.originalVote} → {lock.finalVote}
          </span>
        )}
        {lock.decision === 'hold' && (
          <span className="text-[10px] text-emerald-500 font-mono">{lock.weightMultiplier.toFixed(1)}x</span>
        )}
      </div>
    </div>
  )
}

export function ConvictionProtocol({ scenario, proposal, profile }: ConvictionProtocolProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [stances, setStances] = useState<InitialStance[]>([])
  const [challenges, setChallenges] = useState<ChallengePair[]>([])
  const [convictions, setConvictions] = useState<ConvictionLock[]>([])
  const [tally, setTally] = useState<TallyResult | null>(null)
  const [verdict, setVerdict] = useState<{ approved: boolean; action: string; summary: string } | null>(null)
  const [running, setRunning] = useState(false)
  const [sourceCount, setSourceCount] = useState(0)

  const startProtocol = useCallback(async (scenarioId?: string, customProposal?: string) => {
    setRunning(true)
    setPhase('gathering_evidence')
    setStances([])
    setChallenges([])
    setConvictions([])
    setTally(null)
    setVerdict(null)

    const params = new URLSearchParams()
    if (scenarioId) params.set('scenario', scenarioId)
    if (customProposal) params.set('proposal', customProposal)
    if (profile) params.set('profile', profile)

    const url = `/api/boardroom/stream?${params.toString()}`

    try {
      const res = await fetch(url)
      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            handleEvent(event)
          } catch {}
        }
      }
    } catch {
      // connection error
    } finally {
      setRunning(false)
      setPhase('complete')
    }
  }, [profile])

  function handleEvent(event: Record<string, unknown>) {
    switch (event.type) {
      case 'phase':
        setPhase(event.phase as Phase)
        break
      case 'evidence_ready':
        setSourceCount(event.sourceCount as number)
        break
      case 'stance':
        setStances(prev => [...prev, event.stance as InitialStance])
        break
      case 'challenge_result':
        setChallenges(prev => [...prev, event.pair as ChallengePair])
        break
      case 'conviction':
        setConvictions(prev => [...prev, event.lock as ConvictionLock])
        break
      case 'tally':
        setTally(event.result as TallyResult)
        break
      case 'verdict': {
        const session = event.session as { verdict: { approved: boolean; action: string; orchestratorSummary: string } }
        setVerdict({ approved: session.verdict.approved, action: session.verdict.action, summary: session.verdict.orchestratorSummary })
        break
      }
    }
  }

  const yesStances = stances.filter(s => s.vote === 'yes').length
  const noStances = stances.filter(s => s.vote === 'no').length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">Adversarial Conviction Protocol</h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {phase === 'idle' ? 'Blind stance → Cross-examination → Conviction lock → Verdict' : PHASE_LABELS[phase]}
          </p>
        </div>
        {!running && phase !== 'complete' && (
          <button
            onClick={() => startProtocol(scenario, proposal)}
            className="px-4 py-2 text-xs font-medium rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 transition-all"
          >
            Run Protocol
          </button>
        )}
      </div>

      {/* Progress */}
      {phase !== 'idle' && <PhaseProgress currentPhase={phase} />}

      {/* Evidence Phase */}
      {sourceCount > 0 && phase !== 'gathering_evidence' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[11px] text-gray-400">{sourceCount} live data sources gathered</span>
        </div>
      )}

      {/* Stances */}
      {stances.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Initial Stances (blind)</span>
            <span className="text-[10px] text-gray-600">
              <span className="text-emerald-400">{yesStances} YES</span>
              {' / '}
              <span className="text-red-400">{noStances} NO</span>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {stances.map(s => <StanceCard key={s.agentId} stance={s} />)}
          </div>
        </div>
      )}

      {/* Challenges */}
      {challenges.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Cross-Examination</span>
          {challenges.map((pair, i) => <ChallengeCard key={i} pair={pair} agents={stances} />)}
        </div>
      )}

      {/* Convictions */}
      {convictions.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Conviction Locks</span>
          <div className="space-y-1.5">
            {convictions.map(c => <ConvictionCard key={c.agentId} lock={c} />)}
          </div>
        </div>
      )}

      {/* Tally */}
      {tally && (
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
          <div className="grid grid-cols-3 gap-4 text-center mb-3">
            <div>
              <p className="text-lg font-bold text-emerald-400">{tally.holdCount}</p>
              <p className="text-[10px] text-gray-500 uppercase">Hold</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-400">{tally.flipCount}</p>
              <p className="text-[10px] text-gray-500 uppercase">Flip</p>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-400">{tally.abstainCount}</p>
              <p className="text-[10px] text-gray-500 uppercase">Abstain</p>
            </div>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${tally.weightedPercentage >= 0.7 ? 'bg-emerald-500' : 'bg-red-500'}`}
              style={{ width: `${tally.weightedPercentage * 100}%` }}
            />
          </div>
          <p className="text-center text-xs text-gray-400 mt-2">
            Weighted Conviction: <span className="text-white font-mono">{(tally.weightedPercentage * 100).toFixed(0)}%</span>
            <span className="text-gray-600 ml-2">(threshold: 70%)</span>
          </p>
        </div>
      )}

      {/* Verdict */}
      {verdict && (
        <div className={`p-4 rounded-xl border ${
          verdict.approved ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs font-bold uppercase ${verdict.approved ? 'text-emerald-400' : 'text-red-400'}`}>
              {verdict.approved ? 'APPROVED' : 'REJECTED'}
            </span>
            <span className="text-[10px] text-gray-500">Action: {verdict.action}</span>
          </div>
          <p className="text-sm text-gray-300 leading-relaxed">{verdict.summary}</p>
        </div>
      )}

      {/* Running indicator */}
      {running && phase !== 'complete' && (
        <div className="flex items-center gap-2 justify-center py-2">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
          <span className="text-[11px] text-gray-500">{PHASE_LABELS[phase]}...</span>
        </div>
      )}
    </div>
  )
}
