'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'
import { AGENT_IDS, AGENT_NAMES, AGENT_COLORS } from '@/lib/agent-constants'

type Phase = 'idle' | 'scanning' | 'opportunity' | 'gathering_evidence' | 'initial_stance' | 'persuasion' | 'challenge' | 'conviction_lock' | 'final_tally' | 'orchestrating' | 'executing' | 'complete'
type AgentStatus = 'waiting' | 'thinking' | 'voted_yes' | 'voted_no' | 'challenged' | 'hold' | 'flip' | 'abstain'

interface ActivityEntry { time: string; text: string; type: 'info' | 'opportunity' | 'stance' | 'challenge' | 'verdict' | 'execution' }

const SEATS = [{top:'2%',left:'50%'},{top:'12%',left:'78%'},{top:'36%',left:'93%'},{top:'64%',left:'88%'},{top:'84%',left:'68%'},{top:'84%',left:'32%'},{top:'64%',left:'12%'},{top:'36%',left:'7%'},{top:'12%',left:'22%'}]

function getStatusLabel(status: AgentStatus): string {
  switch(status) {
    case 'waiting': return 'STANDBY'
    case 'thinking': return 'ANALYZING'
    case 'voted_yes': return 'BULLISH'
    case 'voted_no': return 'BEARISH'
    case 'challenged': return 'CHALLENGED'
    case 'hold': return 'HOLDING'
    case 'flip': return 'FLIPPED'
    case 'abstain': return 'ABSTAIN'
  }
}

function getStatusColor(status: AgentStatus): string {
  switch(status) {
    case 'waiting': return 'text-gray-500'
    case 'thinking': return 'text-yellow-400'
    case 'voted_yes': return 'text-emerald-400'
    case 'voted_no': return 'text-red-400'
    case 'challenged': return 'text-orange-400'
    case 'hold': return 'text-emerald-300'
    case 'flip': return 'text-amber-400'
    case 'abstain': return 'text-gray-400'
  }
}

export function WarRoom({ delegationId }: { delegationId?: string | null }) {
  const { address } = useAccount()
  const { formatted: usdcBalance } = useUsdcBalance()
  const [phase, setPhase] = useState<Phase>('idle')
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({})
  const [prices, setPrices] = useState<{eth:number;btc:number}>({eth:0,btc:0})
  const [fearGreed, setFearGreed] = useState<{value:number;classification:string}|null>(null)
  const [strategy, setStrategy] = useState<{allocations:Array<{type:string;percentage:number;protocol:string}>;rules:Record<string,number>;reasoning:string}|null>(null)
  const [config, setConfig] = useState<{targetValue:number;currentValue:number;riskLevel:string}|null>(null)
  const [portfolio, setPortfolio] = useState<{totalValue:number;unrealizedPnL:number}|null>(null)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [centerText, setCenterText] = useState('')
  const [verdict, setVerdict] = useState<{approved:boolean;action:string;percentage:number;summary:string}|null>(null)
  const [running, setRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [currentInput, setCurrentInput] = useState('')
  const [riskInput, setRiskInput] = useState('moderate')
  const [lastTxHash, setLastTxHash] = useState<string|null>(null)
  const [reconnectCount, setReconnectCount] = useState(0)
  const [stopping, setStopping] = useState(false)
  const [bubbles, setBubbles] = useState<Record<string, { text: string; color: string }>>({})
  const activityRef = useRef<HTMLDivElement>(null)
  const sseRef = useRef<EventSource|null>(null)

  function showBubble(agentId: string, text: string, color: string = 'border-white/10') {
    setBubbles(prev => ({ ...prev, [agentId]: { text, color } }))
    setTimeout(() => setBubbles(prev => { const n = {...prev}; delete n[agentId]; return n }), 6000)
  }

  useEffect(() => {
    if (usdcBalance > 0 && !currentInput) {
      setCurrentInput(usdcBalance.toFixed(2))
    }
  }, [usdcBalance])

  useEffect(() => {
    if (activity.length === 0 && !running) {
      const now = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
      setActivity([
        { time: now, text: 'Cortex online — 9 agents standing by', type: 'info' },
        { time: now, text: `Portfolio: $${usdcBalance.toFixed(2)} USDC on Base`, type: 'info' },
      ])
    }
  }, [usdcBalance])

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/feeds/status')
        if (!r.ok) return
        const d = await r.json()
        if (d.prices?.ETHUSDT) setPrices(p => ({...p, eth: d.prices.ETHUSDT.price}))
        if (d.prices?.BTCUSDT) setPrices(p => ({...p, btc: d.prices.BTCUSDT.price}))
        if (d.fearGreed) setFearGreed(d.fearGreed)
      } catch{}
    }
    poll()
    const i = setInterval(poll, 5000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    if (!address || stopping) return
    const poll = async () => {
      if (stopping) return
      try {
        const r = await fetch(`/api/autonomous/status?user=${address}`)
        if (!r.ok) return
        const d = await r.json()
        if (d.status !== 'idle' && d.status !== 'stopped') {
          setRunning(true)
          if (d.status === 'scanning') setPhase('scanning')
          if (d.status === 'deliberating') setPhase('initial_stance')
          if (d.status === 'executing') setPhase('executing')
        } else {
          setRunning(false)
          setPhase('idle')
        }
        if (d.plan) setStrategy({allocations:d.plan.allocations, rules:d.plan.rules, reasoning:d.plan.reasoning})
        if (d.config) setConfig(d.config)
        if (d.portfolio) setPortfolio(d.portfolio)
      } catch{}
    }
    poll()
    const i = setInterval(poll, 3000)
    return () => clearInterval(i)
  }, [phase, running])

  useEffect(() => {
    if (!running || !address) return
    const es = new EventSource(`/api/autonomous/stream?user=${address}`)
    sseRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        handleSSEEvent(data)
      } catch{}
    }
    es.onerror = () => {
      es.close()
      sseRef.current = null
      setTimeout(() => setReconnectCount(c => c + 1), 3000)
    }

    return () => { es.close(); sseRef.current = null }
  }, [running, address, reconnectCount])

  useEffect(() => {
    if (activityRef.current) activityRef.current.scrollTop = activityRef.current.scrollHeight
  }, [activity.length])

  function handleSSEEvent(event: Record<string, unknown>) {
    const now = new Date().toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})

    switch(event.type) {
      case 'status_change':
        if (event.status === 'scanning') { setPhase('scanning'); setCenterText(''); setVerdict(null); setAgentStatuses(Object.fromEntries(AGENT_IDS.map(id=>[id,'waiting' as AgentStatus]))) }
        if (event.status === 'deliberating') setPhase('initial_stance')
        if (event.status === 'executing') { setPhase('executing'); addActivity(now, 'Executing via 1Shot Relayer...', 'execution') }
        break
      case 'plan_generated': {
        const plan = event.plan as {allocations:Array<{type:string;percentage:number;protocol:string}>;reasoning:string}
        if (plan) {
          setStrategy({allocations:plan.allocations, rules:{} as any, reasoning:plan.reasoning})
          addActivity(now, `Strategy: ${plan.allocations.map(a => `${a.percentage}% ${a.type} via ${a.protocol}`).join(', ')}`, 'info')
        }
        break
      }
      case 'opportunity_detected': {
        const opp = event.opportunity as {type:string;proposal:string;trigger:string}
        setPhase('opportunity')
        setCenterText(opp.proposal.slice(0, 80))
        setAgentStatuses(Object.fromEntries(AGENT_IDS.map(id=>[id,'thinking' as AgentStatus])))
        addActivity(now, `Opportunity: ${opp.type.replace(/_/g,' ')} — ${opp.trigger}`, 'opportunity')
        addActivity(now, '9 agents entering deliberation...', 'info')
        break
      }
      case 'deliberation_start':
        setPhase('initial_stance')
        break
      case 'deliberation_complete': {
        const v = event.verdict as {approved:boolean;action:string;percentage:number;summary:string}
        setPhase('complete')
        setVerdict(v)
        setCenterText(`${v.approved?'APPROVED':'REJECTED'} ${(v.percentage*100).toFixed(0)}%`)
        addActivity(now, `${v.approved?'APPROVED':'REJECTED'} (${(v.percentage*100).toFixed(0)}%) — ${v.action}: ${v.summary.slice(0,100)}`, 'verdict')
        break
      }
      case 'execution_complete': {
        const txHash = event.txHash as string | undefined
        const action = event.action as string | undefined
        setPhase('complete')
        if (txHash) {
          addActivity(now, `Confirmed on Base — ${action ?? 'action'}`, 'execution')
          setLastTxHash(txHash)
        }
        break
      }
      case 'conviction_event': {
        const detail = event.detail as Record<string, unknown>
        if (detail.type === 'phase') {
          const p = detail.phase as string
          if (p === 'initial_stance' || p === 'final_tally' || p === 'orchestrating' || p === 'gathering_evidence' || p === 'persuasion') {
            setPhase(p as Phase)
          }
          if (p === 'gathering_evidence') addActivity(now, 'Scanning 12 live data feeds...', 'info')
          if (p === 'initial_stance') addActivity(now, 'Agents forming positions...', 'info')
          if (p === 'persuasion') addActivity(now, 'Majority persuading minority agents...', 'challenge')
          if (p === 'orchestrating') { setCenterText('Venice AI issuing verdict...'); addActivity(now, 'Venice AI synthesizing...', 'info') }
        }
        if (detail.type === 'evidence_ready') {
          const sourceCount = (detail as any).sourceCount ?? 12
          addActivity(now, `${sourceCount} sources analyzed`, 'info')
        }
        if (detail.type === 'stance') {
          const stance = detail.stance as {agentId:string;vote:string;confidence?:number;reasoning?:string;keyEvidence?:string}
          setAgentStatuses(prev => ({...prev, [stance.agentId]: stance.vote === 'yes' ? 'voted_yes' : 'voted_no'}))
          const bubbleText = stance.reasoning ? `${stance.vote.toUpperCase()} — ${stance.reasoning.slice(0,60)}` : stance.vote.toUpperCase()
          showBubble(stance.agentId, bubbleText, stance.vote === 'yes' ? 'border-emerald-500/50' : 'border-red-500/50')
          addActivity(now, `${AGENT_NAMES[stance.agentId] ?? stance.agentId}: ${stance.vote.toUpperCase()}${stance.confidence ? ` (${(stance.confidence*100).toFixed(0)}%)` : ''}${stance.keyEvidence ? ` — ${stance.keyEvidence.slice(0,50)}` : ''}`, 'stance')
        }
        if (detail.type === 'persuasion_round') {
          const pr = detail as any
          const minorityNames = (pr.minority as string[]).map(id => AGENT_NAMES[id] ?? id).join(', ')
          addActivity(now, `Round ${pr.round}: ${pr.majorityCount}/9 ${pr.majorityVote.toUpperCase()} persuading ${minorityNames}`, 'challenge')
          setCenterText(`Persuasion Round ${pr.round}`)
        }
        if (detail.type === 'reconsider') {
          const r = detail as any
          const name = AGENT_NAMES[r.agentId] ?? r.agentId
          if (r.decision === 'flip') {
            setAgentStatuses(prev => ({...prev, [r.agentId]: prev[r.agentId] === 'voted_yes' ? 'voted_no' : 'voted_yes'}))
            showBubble(r.agentId, `FLIPPED — ${r.reasoning.slice(0,50)}`, 'border-amber-500/60')
            addActivity(now, `${name}: FLIPPED — ${r.reasoning.slice(0,60)}`, 'stance')
          } else {
            showBubble(r.agentId, `HOLDS — ${r.reasoning.slice(0,50)}`, 'border-red-500/40')
            addActivity(now, `${name}: HOLDS — ${r.reasoning.slice(0,60)}`, 'stance')
          }
        }
        if (detail.type === 'tally') {
          const t = detail.result as {holdCount?:number;flipCount?:number;abstainCount?:number;survivingYes:number;survivingNo:number;weightedPercentage:number}
          addActivity(now, `Tally: ${t.survivingYes} YES / ${t.survivingNo} NO — ${(t.weightedPercentage*100).toFixed(0)}% approval`, 'info')
        }
        if (detail.type === 'orchestrator_verdict') {
          addActivity(now, `Venice AI final verdict issued`, 'verdict')
        }
        break
      }
      case 'alert':
        addActivity(now, event.message as string, 'info')
        break
    }
  }

  function addActivity(time:string, text:string, type:ActivityEntry['type']) {
    setActivity(prev => [...prev.slice(-80), {time, text, type}])
  }

  async function startAutopilot() {
    if (!currentInput || !targetInput || parseFloat(targetInput) <= parseFloat(currentInput)) return
    setStarting(true)
    const now = () => new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
    addActivity(now(), 'Initializing Cortex...', 'info')
    try {
      const r = await fetch('/api/autonomous/start', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({targetValue:parseFloat(targetInput),currentValue:parseFloat(currentInput),riskLevel:riskInput,timeframe:'6m',autoExecute:!!delegationId,delegationId:delegationId??undefined,userAddress:address})
      })
      if (r.ok) {
        const d = await r.json()
        if (d.plan) {
          setStrategy({allocations:d.plan.allocations,rules:d.plan.rules,reasoning:d.plan.reasoning})
          addActivity(now(), `Strategy: ${d.plan.allocations.map((a:any) => `${a.percentage}% ${a.type} via ${a.protocol}`).join(', ')}`, 'info')
        }
        setConfig({targetValue:parseFloat(targetInput),currentValue:parseFloat(currentInput),riskLevel:riskInput})
        setRunning(true)
        setPhase('scanning')
        addActivity(now(), `Cortex active — monitoring 12 feeds`, 'info')
      } else {
        addActivity(now(), 'Failed to start — check connection', 'info')
      }
    } catch {
      addActivity(now(), 'Network error — try again', 'info')
    } finally { setStarting(false) }
  }

  async function stopAutopilot() {
    setStopping(true)
    const now = new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})
    addActivity(now, 'Shutting down Cortex...', 'info')
    try {
      await fetch('/api/autonomous/stop', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({userAddress:address})})
      setRunning(false)
      setPhase('idle')
      setStrategy(null)
      setConfig(null)
      setPortfolio(null)
      setVerdict(null)
      setLastTxHash(null)
      setAgentStatuses({})
      setBubbles({})
      addActivity(now, 'Cortex offline', 'info')
    } catch {
      addActivity(now, 'Failed to stop — try again', 'info')
    } finally {
      setTimeout(() => setStopping(false), 2000)
    }
  }

  const activeAgentCount = Object.values(agentStatuses).filter(s => s !== 'waiting').length
  const yesCount = Object.values(agentStatuses).filter(s => s === 'voted_yes').length
  const noCount = Object.values(agentStatuses).filter(s => s === 'voted_no').length

  return (
    <div className="space-y-4">
      {/* Status Header Bar */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-white/[0.02] to-white/[0.01] border border-white/[0.06] backdrop-blur-sm">
        <div className="flex items-center gap-5 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50 animate-pulse' : 'bg-gray-600'}`} />
            <span className={`font-semibold tracking-wide ${running ? 'text-emerald-400' : 'text-gray-500'}`}>{running ? 'CORTEX LIVE' : 'CORTEX IDLE'}</span>
          </div>
          <span className="text-gray-600">|</span>
          <span className="text-gray-500">ETH <span className="text-white font-mono">${prices.eth > 0 ? prices.eth.toFixed(2) : '—'}</span></span>
          <span className="text-gray-500">BTC <span className="text-white font-mono">${prices.btc > 0 ? prices.btc.toFixed(0) : '—'}</span></span>
          {fearGreed && (
            <span className="text-gray-500">F&G <span className={`font-mono font-semibold ${fearGreed.value < 30 ? 'text-red-400' : fearGreed.value > 70 ? 'text-emerald-400' : 'text-yellow-400'}`}>{fearGreed.value}</span></span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          {running && (
            <span className="text-gray-500">
              <span className="text-white font-mono">{activeAgentCount}</span>/9 active
              {yesCount + noCount > 0 && <span className="ml-2 text-emerald-400">{yesCount}Y</span>}
              {noCount > 0 && <span className="ml-1 text-red-400">{noCount}N</span>}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/10 text-gray-400 font-mono">
            ${usdcBalance.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        {/* Agent Arena */}
        <div className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent p-4 relative min-h-[480px]">
          <div className="relative w-full aspect-square max-w-[480px] mx-auto">
            {/* Center Orb */}
            <div className="absolute inset-[20%] rounded-full bg-gradient-to-b from-gray-800/30 to-gray-900/50 border border-white/[0.06] shadow-[inset_0_4px_30px_rgba(0,0,0,0.5)]">
              {/* Animated ring when active */}
              {running && phase !== 'idle' && (
                <div className="absolute inset-0 rounded-full border border-white/[0.08] animate-[spin_20s_linear_infinite]" />
              )}
              <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
                {phase === 'idle' && (
                  <div className="space-y-1">
                    <div className="w-8 h-8 mx-auto rounded-full bg-gradient-to-b from-gray-700 to-gray-800 border border-white/10 flex items-center justify-center">
                      <span className="text-gray-500 text-lg">⬡</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2">Set target to activate</p>
                  </div>
                )}
                {phase === 'scanning' && (
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center animate-pulse">
                      <span className="text-emerald-400 text-sm">◉</span>
                    </div>
                    <p className="text-[10px] text-emerald-400 font-medium">Scanning Markets</p>
                    <p className="text-[8px] text-gray-500 font-mono">
                      {prices.eth > 0 && `ETH $${prices.eth.toFixed(0)}`} {prices.btc > 0 && `BTC $${prices.btc.toFixed(0)}`}
                    </p>
                  </div>
                )}
                {phase === 'opportunity' && (
                  <div className="space-y-1">
                    <div className="w-8 h-8 mx-auto rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                      <span className="text-amber-400 text-sm">⚡</span>
                    </div>
                    <p className="text-[9px] text-amber-400 leading-relaxed mt-1">{centerText}</p>
                  </div>
                )}
                {phase === 'gathering_evidence' && (
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center animate-pulse">
                      <span className="text-cyan-400 text-sm">◎</span>
                    </div>
                    <p className="text-[10px] text-cyan-400">Gathering Evidence</p>
                    <p className="text-[8px] text-gray-500">12 data sources</p>
                  </div>
                )}
                {(phase === 'initial_stance' || phase === 'persuasion' || phase === 'challenge' || phase === 'conviction_lock' || phase === 'final_tally') && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-emerald-400 font-mono text-lg font-bold">{yesCount}</span>
                      <span className="text-gray-600 text-xs">vs</span>
                      <span className="text-red-400 font-mono text-lg font-bold">{noCount}</span>
                    </div>
                    <p className="text-[10px] text-blue-400 font-medium">
                      {phase === 'initial_stance' ? 'Voting' : phase === 'persuasion' ? 'Persuasion' : phase === 'challenge' ? 'Cross-Exam' : phase === 'conviction_lock' ? 'Locking' : 'Final Tally'}
                    </p>
                    {centerText && <p className="text-[8px] text-gray-500">{centerText}</p>}
                  </div>
                )}
                {phase === 'orchestrating' && (
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center animate-pulse">
                      <span className="text-amber-400 text-base font-bold">V</span>
                    </div>
                    <p className="text-[10px] text-amber-400 font-semibold">Venice AI</p>
                    <p className="text-[8px] text-amber-400/60">Issuing verdict...</p>
                  </div>
                )}
                {phase === 'executing' && (
                  <div className="space-y-2">
                    <div className="w-10 h-10 mx-auto rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center animate-pulse">
                      <span className="text-purple-400 text-sm">⟡</span>
                    </div>
                    <p className="text-[10px] text-purple-400 font-semibold">Executing</p>
                    <p className="text-[8px] text-purple-400/60">1Shot • Base</p>
                  </div>
                )}
                {phase === 'complete' && verdict && (
                  <div className="space-y-1">
                    <p className={`text-xl font-bold ${verdict.approved ? 'text-emerald-400' : 'text-red-400'}`}>
                      {verdict.approved ? '✓' : '✗'}
                    </p>
                    <p className={`text-sm font-bold ${verdict.approved ? 'text-emerald-400' : 'text-red-400'}`}>
                      {verdict.approved ? 'APPROVED' : 'REJECTED'}
                    </p>
                    <p className="text-[9px] text-gray-400">{(verdict.percentage*100).toFixed(0)}% consensus</p>
                  </div>
                )}
              </div>
            </div>

            {/* Agent Nodes with Blobs */}
            {AGENT_IDS.map((id, idx) => {
              const status = agentStatuses[id] || 'waiting'
              const colors = AGENT_COLORS[id]!
              const pos = SEATS[idx]!
              const isActive = status !== 'waiting'
              const isThinking = status === 'thinking'
              const isVotedYes = status === 'voted_yes' || status === 'hold'
              const isVotedNo = status === 'voted_no'

              return (
                <div key={id} className="absolute transition-all duration-700 ease-out" style={{top:pos.top,left:pos.left,transform:'translate(-50%,-50%)'}}>
                  <div className="flex flex-col items-center relative group">
                    {/* Speech Bubble */}
                    {bubbles[id] && (
                      <div className={`absolute -top-16 left-1/2 -translate-x-1/2 px-2.5 py-2 rounded-xl bg-gray-900/95 border ${bubbles[id].color} max-w-[160px] z-30 shadow-lg backdrop-blur-sm animate-[fadeSlideIn_0.3s_ease-out]`}>
                        <p className="text-[8px] text-white/90 leading-relaxed whitespace-normal">{bubbles[id].text}</p>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-gray-900/95" />
                      </div>
                    )}

                    {/* Status Label Above */}
                    <div className={`absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap transition-all duration-300 ${!bubbles[id] ? 'opacity-100' : 'opacity-0'}`}>
                      <span className={`text-[7px] font-bold tracking-wider ${getStatusColor(status)}`}>
                        {getStatusLabel(status)}
                      </span>
                    </div>

                    {/* Blob/Orb */}
                    <div className="relative">
                      {/* Outer glow ring */}
                      {isActive && (
                        <div className={`absolute inset-[-4px] rounded-full bg-gradient-to-r ${colors.blob} opacity-20 blur-sm ${isThinking ? 'animate-pulse' : ''}`} />
                      )}
                      {/* Main orb */}
                      <div className={`relative w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${
                        isActive ? `${colors.bg} ${colors.border} shadow-lg ${colors.glow}` : 'bg-gray-800/60 border-gray-700/50'
                      } ${isThinking ? 'animate-pulse scale-110' : ''}`}>
                        {/* Inner pattern */}
                        <div className={`absolute inset-1 rounded-full bg-gradient-to-br ${
                          isVotedYes ? 'from-emerald-500/20 to-emerald-700/10' :
                          isVotedNo ? 'from-red-500/20 to-red-700/10' :
                          isThinking ? `from-white/10 to-transparent` :
                          'from-white/5 to-transparent'
                        }`} />
                        {/* Agent initials */}
                        <span className={`relative text-[10px] font-bold ${isActive ? colors.text : 'text-gray-600'}`}>
                          {AGENT_NAMES[id]?.slice(0,2).toUpperCase()}
                        </span>
                        {/* Vote badge */}
                        {(isVotedYes || isVotedNo || status === 'flip' || status === 'abstain') && (
                          <span className={`absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[7px] font-bold text-white shadow-md ${
                            isVotedYes ? 'bg-emerald-500' : isVotedNo ? 'bg-red-500' : status === 'flip' ? 'bg-amber-500' : 'bg-gray-500'
                          }`}>
                            {isVotedYes ? '✓' : isVotedNo ? '✗' : status === 'flip' ? '↺' : '—'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Agent Name */}
                    <span className={`text-[8px] mt-1.5 font-semibold tracking-wide ${isActive ? colors.text : 'text-gray-600'}`}>
                      {AGENT_NAMES[id]}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Panel */}
        <div className="space-y-3">
          {/* Strategy / Setup */}
          {!running && !strategy ? (
            <div className="p-4 rounded-xl bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/[0.08] space-y-3">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Activate Cortex</h3>
              <p className="text-[10px] text-gray-500 leading-relaxed">Set your portfolio target. 9 AI agents will autonomously manage your position.</p>
              <div className="space-y-2">
                <div>
                  <label className="text-[9px] text-gray-500 uppercase tracking-wider">Current Value (USDC)</label>
                  <input type="number" value={currentInput} onChange={e=>setCurrentInput(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white placeholder-gray-600 focus:border-blue-500/50 focus:outline-none transition-colors" placeholder="0.00"/>
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 uppercase tracking-wider">Target Value (USDC)</label>
                  <input type="number" value={targetInput} onChange={e=>setTargetInput(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white placeholder-gray-600 focus:border-blue-500/50 focus:outline-none transition-colors" placeholder="1000"/>
                </div>
                <div>
                  <label className="text-[9px] text-gray-500 uppercase tracking-wider">Risk Tolerance</label>
                  <select value={riskInput} onChange={e=>setRiskInput(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-white focus:border-blue-500/50 focus:outline-none transition-colors">
                    <option value="conservative">Conservative</option>
                    <option value="moderate">Moderate</option>
                    <option value="aggressive">Aggressive</option>
                  </select>
                </div>
              </div>
              <button onClick={startAutopilot} disabled={starting || !targetInput} className="w-full py-2.5 text-xs font-bold rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-500/20">
                {starting ? 'Initializing...' : 'Activate Autopilot'}
              </button>
            </div>
          ) : strategy ? (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Active Strategy</span>
                <div className="flex items-center gap-2">
                  {config && <span className="text-[9px] text-gray-600">${config.currentValue} → ${config.targetValue}</span>}
                  {running && (
                    <button onClick={stopAutopilot} className="text-[9px] px-2.5 py-1 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
                      Stop
                    </button>
                  )}
                </div>
              </div>
              <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-white/5">
                {strategy.allocations.map(a=>(
                  <div key={a.type} className={`rounded-full transition-all duration-500 ${
                    a.type==='lending' ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                    a.type==='trading' ? 'bg-gradient-to-r from-amber-500 to-amber-600' :
                    'bg-gradient-to-r from-gray-500 to-gray-600'
                  }`} style={{width:`${a.percentage}%`}}/>
                ))}
              </div>
              <div className="flex items-center gap-3 mt-2 text-[9px] text-gray-400">
                {strategy.allocations.map(a=>(<span key={a.type} className="capitalize">{a.type} {a.percentage}% <span className="text-gray-600">({a.protocol})</span></span>))}
              </div>
              {strategy.reasoning && (
                <p className="text-[9px] text-gray-500 mt-2 leading-relaxed border-t border-white/5 pt-2">{strategy.reasoning.slice(0,120)}</p>
              )}
              {portfolio && (
                <div className="flex items-center gap-4 mt-2 pt-2 border-t border-white/5 text-[10px]">
                  <span className="text-gray-500">Value: <span className="text-white font-mono font-semibold">${portfolio.totalValue.toFixed(2)}</span></span>
                  <span className={`font-mono font-semibold ${portfolio.unrealizedPnL>=0?'text-emerald-400':'text-red-400'}`}>{portfolio.unrealizedPnL>=0?'+':''}{portfolio.unrealizedPnL.toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : null}

          {/* Verdict Card */}
          {verdict && (
            <div className={`p-3 rounded-xl border backdrop-blur-sm ${verdict.approved ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`text-sm font-bold ${verdict.approved ? 'text-emerald-400' : 'text-red-400'}`}>
                  {verdict.approved ? '✓ APPROVED' : '✗ REJECTED'}
                </span>
                <span className="text-[9px] text-gray-500">{(verdict.percentage*100).toFixed(0)}% • {verdict.action}</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed">{verdict.summary}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 font-medium">Venice AI</span>
                {lastTxHash && (
                  <a href={`https://basescan.org/tx/${lastTxHash}`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors">
                    BaseScan → {lastTxHash.slice(0,8)}...
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Track Badges */}
          <div className="flex flex-wrap gap-1.5">
            <span className="px-2 py-1 rounded-full text-[8px] font-medium bg-blue-500/10 border border-blue-500/20 text-blue-400">ERC-7715 Delegation</span>
            <span className="px-2 py-1 rounded-full text-[8px] font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400">Venice AI x402</span>
            <span className="px-2 py-1 rounded-full text-[8px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">1Shot Gasless</span>
            <span className="px-2 py-1 rounded-full text-[8px] font-medium bg-purple-500/10 border border-purple-500/20 text-purple-400">9-Agent Consensus</span>
          </div>

          {/* Activity Timeline */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.01]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Activity</span>
              <span className="text-[9px] text-gray-600 font-mono">{activity.length}</span>
            </div>
            <div ref={activityRef} className="max-h-[200px] overflow-y-auto p-2 space-y-0.5 scrollbar-thin scrollbar-thumb-gray-800">
              {activity.length === 0 && <p className="text-[10px] text-gray-600 text-center py-6">Activate autopilot to begin</p>}
              {activity.map((a, i) => (
                <div key={i} className="flex items-start gap-2 py-0.5">
                  <span className="text-[8px] font-mono text-gray-600 shrink-0 w-14">{a.time}</span>
                  <span className={`text-[9px] leading-relaxed ${
                    a.type==='verdict' ? 'text-white font-medium' :
                    a.type==='opportunity' ? 'text-amber-400' :
                    a.type==='execution' ? 'text-purple-400' :
                    a.type==='challenge' ? 'text-orange-400' :
                    a.type==='stance' ? 'text-blue-300' :
                    'text-gray-400'
                  }`}>{a.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
