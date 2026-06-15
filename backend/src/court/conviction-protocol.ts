import crypto from 'node:crypto'
import type { Response } from 'express'
import { createPublicClient, http, type Address, erc20Abi } from 'viem'
import { base } from 'viem/chains'
import {
  BOARDROOM_AGENTS,
  CONSENSUS_THRESHOLD,
  ORCHESTRATOR_MODEL,
  VENICE_BASE_URL,
  VENICE_API_KEY,
  CHEAP_MODELS,
  getNextFallback,
  type AgentVote,
  type BoardroomAgent,
  type BoardroomSession,
  type BoardroomVerdict,
} from './boardroom-types.js'
import { gatherMarketEvidence } from './market-tools.js'
import { stakingEngine, type StakeLevel } from '../economy/staking-engine.js'
import { USDC_BASE, WETH_BASE } from '../defi/constants.js'
import { config } from '../config/index.js'
import { caseLawEngine } from '../economy/case-law-engine.js'
import { reputationEngine } from '../economy/reputation-engine.js'
import { prisma } from '../db/client.js'
import type { UserProfile } from './boardroom-stream.js'
import { VeniceClient } from '../services/venice-client.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface InitialStance {
  agentId: string
  role: string
  model: string
  vote: 'yes' | 'no'
  confidence: number
  reasoning: string
  keyEvidence: string
  stake: StakeLevel
  message?: string
}

interface ChatTimelineMessage {
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

interface ChallengePair {
  challenger: string
  defender: string
  challengeArgument: string
  defenseResponse: string
}

type ConvictionDecision = 'hold' | 'flip' | 'abstain'

interface ConvictionLock {
  agentId: string
  role: string
  originalVote: 'yes' | 'no'
  finalVote: 'yes' | 'no' | null
  decision: ConvictionDecision
  reasoning: string
  survivedChallenge: boolean
  weightMultiplier: number
}

type ConvictionEvent =
  | { type: 'phase'; phase: 'gathering_evidence' | 'initial_stance' | 'challenge' | 'conviction_lock' | 'final_tally' | 'orchestrating' | 'persuasion' }
  | { type: 'evidence_ready'; sourceCount: number }
  | { type: 'stance'; stance: InitialStance }
  | { type: 'challenge_pair'; pair: { challenger: string; defender: string } }
  | { type: 'challenge_result'; pair: ChallengePair }
  | { type: 'conviction'; lock: ConvictionLock }
  | { type: 'tally'; result: { holdCount: number; flipCount: number; abstainCount: number; survivingYes: number; survivingNo: number; weightedPercentage: number } }
  | { type: 'verdict'; session: BoardroomSession }
  | { type: 'orchestrator_verdict'; model: string; method: string }
  | { type: 'persuasion_round'; round: number; minority: string[]; majorityVote: string; majorityCount: number }
  | { type: 'reconsider'; agentId: string; decision: 'hold' | 'flip'; reasoning: string; round: number }

function sendSSE(res: Response, event: ConvictionEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

const FALLBACK_MODEL = 'deepseek-v4-flash'

async function callModel(model: string, messages: ChatMessage[], temperature = 0.4, usedModels?: Set<string>): Promise<{ content: string; actualModel: string }> {
  const tried: string[] = []

  const tryModel = async (m: string): Promise<string | null> => {
    try {
      const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${VENICE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: m, messages, temperature, stream: false }),
        signal: AbortSignal.timeout(90000),
      })

      if (!response.ok) {
        console.warn(`[callModel] ${m} failed (${response.status})`)
        return null
      }

      const data = await response.json() as Record<string, unknown>
      const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
      return choices?.[0]?.message?.content ?? null
    } catch (e) {
      console.warn(`[callModel] ${m} error: ${e instanceof Error ? e.message : 'unknown'}`)
      return null
    }
  }

  // Try primary model first
  tried.push(model)
  const primary = await tryModel(model)
  if (primary) return { content: primary, actualModel: model }

  // Rotate through fallbacks from pool, skip already-used models
  const exclude = [...tried, ...(usedModels ? [...usedModels] : [])]
  for (let i = 0; i < 5; i++) {
    const fallback = getNextFallback(exclude)
    if (!fallback) break
    exclude.push(fallback)
    tried.push(fallback)
    const result = await tryModel(fallback)
    if (result) return { content: result, actualModel: fallback }
  }

  throw new Error(`All models failed (tried: ${tried.join(', ')})`)
}

async function getPortfolioContext(userAddress?: string): Promise<Record<string, unknown>> {
  if (!userAddress) {
    return { holdings: { USDC: '0' }, total_value_usd: 0, note: 'No wallet connected' }
  }

  const publicClient = createPublicClient({ chain: base, transport: http(config.rpcUrl) })

  try {
    const [usdcRaw, wethRaw] = await Promise.all([
      publicClient.readContract({
        address: USDC_BASE as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [userAddress as Address],
      }),
      publicClient.readContract({
        address: WETH_BASE as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [userAddress as Address],
      }),
    ])

    const usdcBalance = Number(usdcRaw) / 1e6
    const wethBalance = Number(wethRaw) / 1e18

    const { realtimeFeeds } = await import('../services/realtime-feeds.js')
    const ethPrice = realtimeFeeds.getLatestPrices().get('ETHUSDT')?.price ?? 2500
    const wethValueUsd = wethBalance * ethPrice
    const totalValueUsd = usdcBalance + wethValueUsd

    return {
      holdings: {
        USDC: `${usdcBalance.toFixed(2)} USDC`,
        WETH: wethBalance > 0.0001 ? `${wethBalance.toFixed(6)} WETH (~$${wethValueUsd.toFixed(2)})` : '0 WETH',
      },
      total_value_usd: Number(totalValueUsd.toFixed(2)),
      usdc_available: Number(usdcBalance.toFixed(2)),
      max_spend_per_tx: Number((usdcBalance * 0.5).toFixed(2)),
      wallet: userAddress,
    }
  } catch {
    return { holdings: { USDC: '0' }, total_value_usd: 0, note: 'Failed to read on-chain balance' }
  }
}

const RISK_FRAMEWORK_SHORT = `RISK SCORING:
- Position Size: <5%=1, 5-15%=2, 15-30%=3, 30-50%=4, >50%=5
- Protocol: TVL>$500M+audited=1, $10-500M=3, <$10M or no audit=5
- Market: Fear&Greed 40-60=1, extremes=5. Vol<2%=1, >5%=5
- Action: Stablecoin lending=1, small swap=2, large swap=4, new protocol=4, leverage=5
- Composite = average. Below 2.5=YES, 2.5-3.5=judgment, above 3.5=NO`

export async function runConvictionProtocol(res: Response, proposal?: string, userProfile?: UserProfile, userAddress?: string): Promise<BoardroomSession> {
  const sessionId = crypto.randomUUID()
  const timestamp = Date.now()
  const agents = BOARDROOM_AGENTS

  // Phase 1: Gather Evidence
  sendSSE(res, { type: 'phase', phase: 'gathering_evidence' })

  const evidenceItems = await gatherMarketEvidence()
  const evidence: Record<string, unknown> = {}
  for (const item of evidenceItems) {
    const key = `${item.type}_${item.source.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}`
    evidence[key] = { ...item.data, _source: item.source, _description: item.description }
  }
  evidence['portfolio_context'] = await getPortfolioContext(userAddress)

  if (userProfile) {
    evidence['user_profile'] = {
      risk_appetite: userProfile.riskAppetite,
      persona: userProfile.persona,
      max_position_pct: userProfile.maxPositionPct,
    }
  }

  const portfolioCtx = evidence['portfolio_context'] as { usdc_available?: number; total_value_usd?: number }
  const availableUsdc = portfolioCtx?.usdc_available ?? 0
  const supplyAmount = Math.floor(availableUsdc * 0.5 * 100) / 100
  const pctOfHoldings = portfolioCtx?.total_value_usd && portfolioCtx.total_value_usd > 0
    ? Math.round((supplyAmount / portfolioCtx.total_value_usd) * 100)
    : 50
  const defaultProposal = availableUsdc > 0
    ? `Supply ${supplyAmount} USDC (${pctOfHoldings}% of holdings) to Aave v3 on Base at current APY.`
    : 'No actionable proposal — portfolio balance is zero.'
  const activeProposal = proposal || defaultProposal
  const proposalDomain = detectDomain(activeProposal)

  const caseLawCases = await caseLawEngine.getRelevantCases(proposalDomain, undefined, 500, 2)
  const caseLawPrompt = caseLawEngine.formatCasesForPrompt(caseLawCases)

  const agentDbRecords = await prisma.agent.findMany({ where: { isActive: true } })
  const agentReputationMap = new Map(agentDbRecords.map(a => [a.id, { reputation: a.reputation, locked: a.lockedReputation }]))

  sendSSE(res, { type: 'evidence_ready', sourceCount: evidenceItems.length })

  // Phase 2: Initial Stance (SEQUENTIAL — one agent at a time for live feedback)
  sendSSE(res, { type: 'phase', phase: 'initial_stance' })

  const evidenceStr = JSON.stringify(evidence, null, 1)
  const trimmedEvidence = evidenceStr.length > 3000 ? evidenceStr.slice(0, 3000) + '\n...(truncated)' : evidenceStr

  const stances: InitialStance[] = []
  const usedModels = new Set<string>()
  const chatMessages: ChatTimelineMessage[] = []

  for (const agent of agents) {
    const agentRep = agentReputationMap.get(agent.id) ?? { reputation: 50, locked: 0 }
    const stakingPromptText = stakingEngine.buildStakingPrompt(agentRep.reputation, agentRep.locked)

    const prompt = `You are the ${agent.role}. Expertise: ${agent.description}.
${RISK_FRAMEWORK_SHORT}
${caseLawPrompt}
PROPOSAL: ${activeProposal}

EVIDENCE:
${trimmedEvidence}
${stakingPromptText}

Give your INDEPENDENT position. Do NOT hedge. Take a clear stance.
JSON only:
{"vote":"yes"|"no","confidence":0.0-1.0,"reasoning":"[2-3 sentences with risk scores]","key_evidence":"[single most important data point]","stake":"none"|"low"|"high"|"all_in","message":"[Write 4-6 natural conversational sentences as if you are speaking in a group discussion with other analysts. Be opinionated, reference specific data from the evidence, explain your logic clearly. Write in first person. Do not use bullet points or headers.]"}`

    try {
      const { content: raw, actualModel } = await callModel(agent.model, [{ role: 'user', content: prompt }], 0.4, usedModels)
      usedModels.add(actualModel)
      const stance = parseStance(raw, { ...agent, model: actualModel })
      chatMessages.push({ agentId: stance.agentId, role: stance.role, model: stance.model, type: 'stance', content: stance.message || stance.reasoning, vote: stance.vote, confidence: stance.confidence, timestamp: Date.now() })
      sendSSE(res, { type: 'stance', stance })
      stances.push(stance)
    } catch {
      usedModels.add(agent.model)
      const stance: InitialStance = { agentId: agent.id, role: agent.role, model: agent.model, vote: 'no', confidence: 0, reasoning: 'Agent unavailable', keyEvidence: '', stake: 'none' }
      chatMessages.push({ agentId: agent.id, role: agent.role, model: agent.model, type: 'stance', content: 'Agent unavailable — could not reach model in time.', vote: 'no', confidence: 0, timestamp: Date.now() })
      sendSSE(res, { type: 'stance', stance })
      stances.push(stance)
    }
  }

  // Lock stakes
  for (const stance of stances) {
    if (stance.stake !== 'none') {
      const agentRep = agentReputationMap.get(stance.agentId)
      if (agentRep && stakingEngine.canStake(agentRep.reputation, agentRep.locked, stance.stake)) {
        await stakingEngine.lockStake(stance.agentId, stance.stake)
      }
    }
  }

  // Phase 3: Consensus Rounds (persuade minority, max 4 rounds)
  const MAX_PERSUASION_ROUNDS = 4
  const CONSENSUS_TARGET = 8
  let currentStances = [...stances]
  let totalRounds = 0
  const roundHistory: Array<{ round: number; minority: string[]; flips: string[]; holds: string[] }> = []

  for (let round = 1; round <= MAX_PERSUASION_ROUNDS; round++) {
    const yesCount = currentStances.filter(s => s.vote === 'yes').length
    const noCount = currentStances.filter(s => s.vote === 'no').length

    if (yesCount >= CONSENSUS_TARGET || noCount >= CONSENSUS_TARGET) break
    totalRounds = round

    sendSSE(res, { type: 'phase', phase: 'persuasion' })

    const isYesMajority = yesCount > noCount
    const majorityVote = isYesMajority ? 'yes' : 'no'
    const minority = currentStances.filter(s => s.vote !== majorityVote)
    const majority = currentStances.filter(s => s.vote === majorityVote)

    sendSSE(res, { type: 'persuasion_round', round, minority: minority.map(m => m.agentId), majorityVote, majorityCount: majority.length })

    const majorityArguments = majority.map(m => `[${m.role}]: ${m.reasoning}`).join('\n')
    const roundFlips: string[] = []
    const roundHolds: string[] = []

    for (const minorityStance of minority) {
      const agentDef = agents.find(a => a.id === minorityStance.agentId)!
      const prompt = `You are ${minorityStance.role}. Round ${round} of deliberation.

You voted ${minorityStance.vote.toUpperCase()}. Your reasoning: ${minorityStance.reasoning}

However, the MAJORITY (${majority.length}/9 agents) voted the opposite. Their arguments:
${majorityArguments}

Reconsider honestly. You may:
- FLIP: Change your vote. The majority's arguments are more compelling.
- HOLD: Maintain your position. Explain why you disagree despite majority pressure.

JSON only: {"decision":"hold"|"flip","reasoning":"[1-2 sentences]","message":"[Write 3-5 natural conversational sentences responding to the majority arguments. Address specific points they made. If you flip, explain what convinced you. If you hold, explain why their arguments fail to sway you. First person, conversational, like you are replying in a group chat.]"}`

      try {
        const { content: raw } = await callModel(minorityStance.model, [{ role: 'user', content: prompt }], 0.4, usedModels)
        const result = parseReconsideration(raw)
        sendSSE(res, { type: 'reconsider', agentId: minorityStance.agentId, decision: result.decision, reasoning: result.reasoning, round })

        const majorityLeader = majority[0]?.agentId
        chatMessages.push({ agentId: minorityStance.agentId, role: minorityStance.role, model: minorityStance.model, type: result.decision === 'flip' ? 'flip' : 'hold', content: result.message || result.reasoning, replyTo: majorityLeader, round, timestamp: Date.now() })

        if (result.decision === 'flip') {
          const idx = currentStances.findIndex(s => s.agentId === minorityStance.agentId)
          currentStances[idx] = { ...currentStances[idx], vote: minorityStance.vote === 'yes' ? 'no' : 'yes', reasoning: result.reasoning }
          roundFlips.push(minorityStance.agentId)
        } else {
          roundHolds.push(minorityStance.agentId)
        }
      } catch {
        sendSSE(res, { type: 'reconsider', agentId: minorityStance.agentId, decision: 'hold', reasoning: 'Failed to process — maintaining position', round })
        chatMessages.push({ agentId: minorityStance.agentId, role: minorityStance.role, model: minorityStance.model, type: 'hold', content: 'I maintain my position — could not process the majority arguments in time.', replyTo: majority[0]?.agentId, round, timestamp: Date.now() })
        roundHolds.push(minorityStance.agentId)
      }
    }

    roundHistory.push({ round, minority: minority.map(m => m.agentId), flips: roundFlips, holds: roundHolds })
  }

  // Phase 4: Final Tally — majority wins
  sendSSE(res, { type: 'phase', phase: 'final_tally' })

  const finalYes = currentStances.filter(s => s.vote === 'yes').length
  const finalNo = currentStances.filter(s => s.vote === 'no').length
  const approved = finalYes > finalNo
  const weightedPercentage = finalYes / currentStances.length

  sendSSE(res, { type: 'tally', result: {
    holdCount: currentStances.length,
    flipCount: roundHistory.reduce((sum, r) => sum + r.flips.length, 0),
    abstainCount: 0,
    survivingYes: finalYes,
    survivingNo: finalNo,
    weightedPercentage,
  }})

  // Phase 5: Orchestrator Verdict (Venice AI)
  sendSSE(res, { type: 'phase', phase: 'orchestrating' })

  const orchestratorResult = await orchestratorVerdict(res, currentStances, [], [], evidence, activeProposal, weightedPercentage)

  chatMessages.push({ agentId: 'venice-orchestrator', role: 'Venice AI Judge', model: 'venice-orchestrator', type: 'verdict', content: orchestratorResult.summary, vote: approved ? 'yes' : 'no', confidence: weightedPercentage, timestamp: Date.now() })

  const verdict: BoardroomVerdict = {
    action: orchestratorResult.action,
    approved,
    finalPercentage: weightedPercentage,
    totalRounds: totalRounds + 1,
    rounds: [{
      round: 1,
      votes: currentStances.map(s => ({ agentId: s.agentId, role: s.role, model: s.model, vote: s.vote, confidence: s.confidence, reasoning: s.reasoning, data: { key_evidence: s.keyEvidence } })),
      yesCount: finalYes,
      noCount: finalNo,
      percentage: weightedPercentage,
      consensusReached: approved,
    }],
    orchestratorSummary: orchestratorResult.summary,
    params: orchestratorResult.params,
  }

  const session: BoardroomSession = {
    id: sessionId,
    timestamp,
    agents,
    verdict,
    evidencePackage: evidence,
  }

  sendSSE(res, { type: 'verdict', session })

  // Record to DB with full audit trail
  try {
    const voteRecords = currentStances.map(s => ({
      agentId: s.agentId,
      vote: s.vote,
      confidence: s.confidence,
      reasoning: s.reasoning,
      data: { key_evidence: s.keyEvidence, stake: s.stake } as Record<string, unknown>,
    }))
    await reputationEngine.recordSession(sessionId, activeProposal, proposalDomain, 'conviction', voteRecords, {
      action: verdict.action,
      approved: verdict.approved,
      percentage: verdict.finalPercentage,
      weightedPercentage,
      summary: verdict.orchestratorSummary,
    }, userAddress)
    await caseLawEngine.storeCaseLaw(sessionId, proposalDomain, detectRiskLevel(stances))

    // Persist full audit: rounds, stances, persuasion history
    await prisma.session.update({
      where: { id: sessionId },
      data: {
        convictionLog: { initialStances: stances, rounds: roundHistory, finalStances: currentStances, totalRounds, chatMessages } as unknown as object,
        trigger: (evidence['_trigger'] as string) ?? null,
        triggerData: (evidence['_triggerData'] as object) ?? null,
      },
    })
  } catch {
    // non-blocking
  }

  return session
}

function parseStance(raw: string, agent: BoardroomAgent): InitialStance {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*"vote"[\s\S]*\}/)

  try {
    const parsed = JSON.parse(jsonMatch?.[0] ?? cleaned) as Record<string, unknown>
    return {
      agentId: agent.id,
      role: agent.role,
      model: agent.model,
      vote: parsed.vote === 'yes' ? 'yes' : 'no',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      keyEvidence: typeof parsed.key_evidence === 'string' ? parsed.key_evidence : '',
      stake: stakingEngine.parseStakeLevel(typeof parsed.stake === 'string' ? parsed.stake : 'none'),
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
    }
  } catch {
    const hasYes = raw.toLowerCase().includes('"vote":"yes"') || raw.toLowerCase().includes('"vote": "yes"')
    return { agentId: agent.id, role: agent.role, model: agent.model, vote: hasYes ? 'yes' : 'no', confidence: 0.4, reasoning: raw.slice(0, 150), keyEvidence: '', stake: 'none' }
  }
}

function parseConviction(raw: string, stance: InitialStance): ConvictionLock {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  const jsonMatch = cleaned.match(/\{[\s\S]*"decision"[\s\S]*\}/)

  try {
    const parsed = JSON.parse(jsonMatch?.[0] ?? cleaned) as Record<string, unknown>
    const decision = ['hold', 'flip', 'abstain'].includes(parsed.decision as string)
      ? parsed.decision as ConvictionDecision
      : 'hold'

    let finalVote: 'yes' | 'no' | null = stance.vote
    let weightMultiplier = 1.0

    if (decision === 'flip') {
      finalVote = stance.vote === 'yes' ? 'no' : 'yes'
      weightMultiplier = 0.7
    } else if (decision === 'abstain') {
      finalVote = null
      weightMultiplier = 0
    } else {
      weightMultiplier = 1.3
    }

    return {
      agentId: stance.agentId,
      role: stance.role,
      originalVote: stance.vote,
      finalVote,
      decision,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      survivedChallenge: decision === 'hold',
      weightMultiplier,
    }
  } catch {
    return { agentId: stance.agentId, role: stance.role, originalVote: stance.vote, finalVote: stance.vote, decision: 'hold', reasoning: 'Parse error — maintaining position', survivedChallenge: true, weightMultiplier: 1.0 }
  }
}

interface PairSetup {
  challengerId: string
  defenderId: string
}

function parseReconsideration(raw: string): { decision: 'hold' | 'flip'; reasoning: string; message?: string } {
  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*"decision"[\s\S]*\}/)
    if (!jsonMatch) return { decision: 'hold', reasoning: 'Could not parse response' }
    const parsed = JSON.parse(jsonMatch[0])
    return {
      decision: parsed.decision === 'flip' ? 'flip' : 'hold',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning.slice(0, 200) : 'No reasoning provided',
      message: typeof parsed.message === 'string' ? parsed.message : undefined,
    }
  } catch {
    return { decision: 'hold', reasoning: 'Failed to process — maintaining position' }
  }
}

function buildChallengePairs(yesGroup: InitialStance[], noGroup: InitialStance[]): PairSetup[] {
  const pairs: PairSetup[] = []
  const maxPairs = Math.min(2, Math.max(yesGroup.length, noGroup.length))

  for (let i = 0; i < maxPairs; i++) {
    if (i < noGroup.length && i < yesGroup.length) {
      pairs.push({ challengerId: noGroup[i]!.agentId, defenderId: yesGroup[i]!.agentId })
    }
  }

  if (pairs.length === 0 && yesGroup.length >= 2) {
    pairs.push({ challengerId: yesGroup[yesGroup.length - 1]!.agentId, defenderId: yesGroup[0]!.agentId })
  }
  if (pairs.length === 0 && noGroup.length >= 2) {
    pairs.push({ challengerId: noGroup[noGroup.length - 1]!.agentId, defenderId: noGroup[0]!.agentId })
  }

  return pairs
}

async function executeChallenge(pair: PairSetup, stances: InitialStance[], proposal: string, agents: BoardroomAgent[]): Promise<ChallengePair> {
  const challenger = stances.find(s => s.agentId === pair.challengerId)!
  const defender = stances.find(s => s.agentId === pair.defenderId)!
  const challengerAgent = agents.find(a => a.id === pair.challengerId)!
  const defenderAgent = agents.find(a => a.id === pair.defenderId)!

  const challengePrompt = `You are the ${challengerAgent.role}. You voted ${challenger.vote.toUpperCase()} on: "${proposal}"

The ${defenderAgent.role} voted ${defender.vote.toUpperCase()} with reasoning: "${defender.reasoning}"
Their key evidence: "${defender.keyEvidence}"

ATTACK their position. Find the weakness in their argument. Use specific data to counter their evidence. Be sharp and precise — this is cross-examination, not a polite discussion.

Respond in 2-3 sentences. No JSON — direct argument only.`

  let challengeArgument: string
  try {
    const { content } = await callModel(challengerAgent.model, [{ role: 'user', content: challengePrompt }])
    challengeArgument = content.slice(0, 300)
  } catch {
    challengeArgument = `Challenge unavailable from ${challengerAgent.role}`
  }

  const defensePrompt = `You are the ${defenderAgent.role}. You voted ${defender.vote.toUpperCase()} on: "${proposal}"

The ${challengerAgent.role} challenges you: "${challengeArgument}"

DEFEND your position. Counter their attack with specific evidence. Stand your ground or acknowledge if they have a valid point.

Respond in 2-3 sentences. No JSON — direct defense only.`

  let defenseResponse: string
  try {
    const { content } = await callModel(defenderAgent.model, [{ role: 'user', content: defensePrompt }])
    defenseResponse = content.slice(0, 300)
  } catch {
    defenseResponse = `Defense unavailable from ${defenderAgent.role}`
  }

  return { challenger: pair.challengerId, defender: pair.defenderId, challengeArgument, defenseResponse }
}

async function orchestratorVerdict(
  res: Response,
  stances: InitialStance[],
  convictions: ConvictionLock[],
  challenges: ChallengePair[],
  evidence: Record<string, unknown>,
  proposal: string,
  weightedPercentage: number
): Promise<{ summary: string; action: BoardroomVerdict['action']; params?: Record<string, unknown> }> {
  const holdCount = convictions.filter(c => c.decision === 'hold').length
  const flipCount = convictions.filter(c => c.decision === 'flip').length
  const abstainCount = convictions.filter(c => c.decision === 'abstain').length

  const transcript = convictions.map(c =>
    `[${c.role}] ${c.originalVote.toUpperCase()} → ${c.decision.toUpperCase()}${c.finalVote ? ` (final: ${c.finalVote})` : ''}: ${c.reasoning}`
  ).join('\n')

  const prompt = `You are the Chief Judge of the Adversarial Conviction Protocol.

PROPOSAL: ${proposal}
WEIGHTED CONSENSUS: ${(weightedPercentage * 100).toFixed(0)}% (threshold: 70%)
CONVICTION RESULTS: ${holdCount} HOLD, ${flipCount} FLIP, ${abstainCount} ABSTAIN

TRANSCRIPT:
${transcript}

KEY CHALLENGES:
${challenges.slice(0, 3).map(c => `${c.challenger} → ${c.defender}: "${c.challengeArgument.slice(0, 100)}"`).join('\n')}

TASK: Issue final verdict. Synthesize the adversarial process — note which arguments survived, which crumbled, and what the conviction pattern reveals.

JSON only:
{"summary":"[2-3 sentences]","action":"supply"|"swap"|"withdraw"|"rebalance"|"hold","params":{"token":"...","amount":0,"protocol":"..."}}`

  try {
    const venice = new VeniceClient()
    const response = await venice.chat(
      [{ role: 'user', content: prompt }],
      { temperature: 0.2 }
    )
    const raw = response.content
    sendSSE(res, { type: 'orchestrator_verdict', model: 'Venice AI', method: 'x402-siwe' })
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Deliberation complete',
      action: ['supply', 'swap', 'withdraw', 'rebalance', 'hold'].includes(parsed.action as string)
        ? parsed.action as BoardroomVerdict['action']
        : weightedPercentage >= CONSENSUS_THRESHOLD ? 'supply' : 'hold',
      params: typeof parsed.params === 'object' ? parsed.params as Record<string, unknown> : undefined,
    }
  } catch {
    return {
      summary: weightedPercentage >= CONSENSUS_THRESHOLD
        ? `Approved with ${(weightedPercentage * 100).toFixed(0)}% weighted conviction. ${holdCount} agents held under challenge.`
        : `Rejected — insufficient conviction (${(weightedPercentage * 100).toFixed(0)}%). ${flipCount} agents flipped, ${abstainCount} abstained.`,
      action: weightedPercentage >= CONSENSUS_THRESHOLD ? 'supply' : 'hold',
    }
  }
}

function detectDomain(proposal: string): string {
  const lower = proposal.toLowerCase()
  if (lower.includes('supply') || lower.includes('lend') || lower.includes('aave') || lower.includes('deposit')) return 'lending'
  if (lower.includes('swap') || lower.includes('trade') || lower.includes('exchange')) return 'swap'
  if (lower.includes('withdraw') || lower.includes('remove')) return 'withdraw'
  if (lower.includes('rebalance') || lower.includes('allocat')) return 'rebalance'
  if (lower.includes('leverage') || lower.includes('borrow') || lower.includes('loop')) return 'leverage'
  return 'general'
}

function detectRiskLevel(stances: InitialStance[]): string {
  const avgConf = stances.reduce((sum, s) => sum + s.confidence, 0) / stances.length
  if (avgConf >= 0.8) return 'low'
  if (avgConf >= 0.5) return 'medium'
  return 'high'
}
