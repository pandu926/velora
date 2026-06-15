import crypto from 'node:crypto'
import type { Response } from 'express'
import {
  BOARDROOM_AGENTS,
  CONSENSUS_THRESHOLD,
  MAX_ROUNDS,
  ORCHESTRATOR_MODEL,
  VENICE_BASE_URL,
  VENICE_API_KEY,
  type AgentVote,
  type BoardroomAgent,
  type BoardroomSession,
  type BoardroomVerdict,
  type ConsensusRound,
} from './boardroom-types.js'
import { gatherMarketEvidence } from './market-tools.js'
import { stakingEngine, type StakeLevel } from '../economy/staking-engine.js'
import { caseLawEngine } from '../economy/case-law-engine.js'
import { reputationEngine } from '../economy/reputation-engine.js'
import { prisma } from '../db/client.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callModel(model: string, messages: ChatMessage[], temperature = 0.4): Promise<string> {
  const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VENICE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature, stream: false, tools: [{ type: 'web_search' }] }),
  })

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown')
    throw new Error(`Model ${model} failed (${response.status}): ${err}`)
  }

  const data = await response.json() as Record<string, unknown>
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
  return choices?.[0]?.message?.content ?? ''
}

const RISK_FRAMEWORK_SHORT = `RISK SCORING (use to justify your vote):
- Position Size: <5%=1, 5-15%=2, 15-30%=3, 30-50%=4, >50%=5
- Protocol: TVL>$500M+audited=1, $10-500M=3, <$10M or no audit=5
- Market: Fear&Greed 40-60=1, extremes=5. Vol<2%=1, >5%=5
- Action: Stablecoin lending=1, small swap=2, large swap=4, new protocol=4, leverage=5
- Composite = average of 4 scores. Below 2.5=vote YES, 2.5-3.5=use judgment, above 3.5=vote NO
- If user profile present: conservative treats 2.5+ as NO, aggressive treats 3.5+ as NO`

function buildAgentPrompt(agent: BoardroomAgent, evidence: Record<string, unknown>, proposal: string, round: number, dissent?: string[], stakingPrompt?: string, caseLawPrompt?: string): string {
  const dissentContext = round > 1 && dissent?.length
    ? `\n\nDISSENT FROM PREVIOUS ROUND:\n${dissent.join('\n')}\n\nConsider their arguments. You may change your vote.`
    : ''

  const evidenceStr = JSON.stringify(evidence, null, 1)
  const trimmedEvidence = evidenceStr.length > 3000 ? evidenceStr.slice(0, 3000) + '\n...(truncated)' : evidenceStr

  const stakingSection = stakingPrompt || ''
  const caseLawSection = caseLawPrompt || ''

  return `You are the ${agent.role} in a DeFi AI Boardroom. Expertise: ${agent.description}.

${RISK_FRAMEWORK_SHORT}
${caseLawSection}
PROPOSAL: ${proposal}

EVIDENCE:
${trimmedEvidence}
${dissentContext}
${stakingSection}

Vote YES or NO. Cite composite risk score in reasoning. JSON only:
{"vote":"yes"|"no","confidence":0.0-1.0,"reasoning":"Position=X, Protocol=X, Market=X, Action=X → Composite=X. [explain]","data":{"composite_risk":X.X,"key_factor":"..."},"stake":"none"|"low"|"high"|"all_in"}`
}

function parseAgentResponse(raw: string, agent: BoardroomAgent): AgentVote & { stake: StakeLevel } {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  const jsonMatch = cleaned.match(/\{[\s\S]*"vote"[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    const stakeRaw = typeof parsed.stake === 'string' ? parsed.stake : 'none'
    return {
      agentId: agent.id,
      role: agent.role,
      model: agent.model,
      vote: parsed.vote === 'yes' ? 'yes' : 'no',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
      data: typeof parsed.data === 'object' && parsed.data !== null ? parsed.data as Record<string, unknown> : {},
      stake: stakingEngine.parseStakeLevel(stakeRaw),
    }
  } catch {
    const hasYes = raw.toLowerCase().includes('"vote": "yes"') || raw.toLowerCase().includes('"vote":"yes"')
    return {
      agentId: agent.id,
      role: agent.role,
      model: agent.model,
      vote: hasYes ? 'yes' : 'no',
      confidence: 0.4,
      reasoning: raw.slice(0, 200).replace(/[{}"]/g, '').trim() || 'Response parsing failed',
      data: {},
      stake: 'none',
    }
  }
}

type StreamEvent =
  | { type: 'phase'; phase: string }
  | { type: 'agent_start'; agentId: string; role: string; model: string; reputation?: number; stake?: string }
  | { type: 'agent_vote'; vote: AgentVote & { stake?: string; stakedAmount?: number } }
  | { type: 'round_complete'; round: ConsensusRound & { weightedPercentage?: number } }
  | { type: 'orchestrator_start' }
  | { type: 'verdict'; session: BoardroomSession }

function sendSSE(res: Response, event: StreamEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

export interface UserProfile {
  riskAppetite: string
  recommendedThreshold: number
  maxPositionPct: number
  persona: string
}

export async function runBoardroomStreaming(res: Response, proposal?: string, userProfile?: UserProfile): Promise<BoardroomSession> {
  const sessionId = crypto.randomUUID()
  const timestamp = Date.now()
  const agents = BOARDROOM_AGENTS

  sendSSE(res, { type: 'phase', phase: 'gathering_evidence' })

  const evidenceItems = await gatherMarketEvidence()
  const evidence: Record<string, unknown> = {}
  for (const item of evidenceItems) {
    const key = `${item.type}_${item.source.replace(/[^a-z0-9]/gi, '_').slice(0, 30)}`
    evidence[key] = { ...item.data, _source: item.source, _description: item.description }
  }
  evidence['portfolio_context'] = {
    holdings: { USDC: '1000 USDC', WETH: '0.5 WETH (~$850)' },
    total_value_usd: 1850,
    aave_v3_base_rates: { USDC_supply_apy: '3.2%', WETH_supply_apy: '1.8%' },
    protocol_note: 'Aave v3 on Base — audited, $500M+ TVL, battle-tested since 2023',
  }

  if (userProfile) {
    evidence['user_profile'] = {
      risk_appetite: userProfile.riskAppetite,
      consensus_threshold: userProfile.recommendedThreshold,
      max_position_pct: userProfile.maxPositionPct,
      persona: userProfile.persona,
      instruction: `This user is classified as "${userProfile.persona}" with ${userProfile.riskAppetite} risk appetite. Adjust your vote per the Risk Framework user profile override rules.`,
    }
  }

  const defaultProposal = 'Supply 500 USDC (27% of USDC holdings) to Aave v3 on Base at ~3.2% APY. Aave is battle-tested with $500M+ TVL on Base. Position is withdrawable anytime.'
  const activeProposal = proposal || defaultProposal

  const proposalDomain = detectDomain(activeProposal)
  const caseLawCases = await caseLawEngine.getRelevantCases(proposalDomain, undefined, 500, 2)
  const caseLawPrompt = caseLawEngine.formatCasesForPrompt(caseLawCases)

  const agentDbRecords = await prisma.agent.findMany({ where: { isActive: true } })
  const agentReputationMap = new Map(agentDbRecords.map(a => [a.id, { reputation: a.reputation, locked: a.lockedReputation }]))

  sendSSE(res, { type: 'phase', phase: 'voting' })

  const rounds: ConsensusRound[] = []
  const allStakes = new Map<string, StakeLevel>()

  for (let roundNum = 1; roundNum <= MAX_ROUNDS; roundNum++) {
    const dissent = roundNum > 1 ? rounds[roundNum - 2]?.dissent : undefined
    const votes: AgentVote[] = []

    const votePromises = agents.map(async (agent): Promise<AgentVote & { stake: StakeLevel }> => {
      const agentRep = agentReputationMap.get(agent.id) ?? { reputation: 50, locked: 0 }
      sendSSE(res, { type: 'agent_start', agentId: agent.id, role: agent.role, model: agent.model, reputation: agentRep.reputation })

      try {
        const stakingPromptText = stakingEngine.buildStakingPrompt(agentRep.reputation, agentRep.locked)
        const prompt = buildAgentPrompt(agent, evidence, activeProposal, roundNum, dissent, stakingPromptText, caseLawPrompt)
        const response = await callModel(agent.model, [{ role: 'user', content: prompt }])
        const vote = parseAgentResponse(response, agent)

        if (vote.stake !== 'none' && stakingEngine.canStake(agentRep.reputation, agentRep.locked, vote.stake)) {
          await stakingEngine.lockStake(agent.id, vote.stake)
          allStakes.set(agent.id, vote.stake)
        }

        const stakeConfig = stakingEngine.getStakeConfig(vote.stake)
        sendSSE(res, { type: 'agent_vote', vote: { ...vote, stake: vote.stake, stakedAmount: stakeConfig.amount } })
        return vote
      } catch (error) {
        const vote: AgentVote & { stake: StakeLevel } = {
          agentId: agent.id,
          role: agent.role,
          model: agent.model,
          vote: 'no',
          confidence: 0,
          reasoning: `Agent unavailable: ${error instanceof Error ? error.message : 'unknown'}`,
          data: {},
          stake: 'none',
        }
        sendSSE(res, { type: 'agent_vote', vote })
        return vote
      }
    })

    const allVotes = await Promise.all(votePromises)
    votes.push(...allVotes)

    const yesCount = votes.filter(v => v.vote === 'yes').length
    const noCount = votes.filter(v => v.vote === 'no').length
    const percentage = yesCount / votes.length

    const voteRecords = votes.map(v => ({
      agentId: v.agentId,
      vote: v.vote as 'yes' | 'no',
      confidence: v.confidence,
      reasoning: v.reasoning,
      data: v.data,
    }))
    const { weightedPercentage } = await reputationEngine.getWeightedConsensus(voteRecords, proposalDomain)

    const dissentReasons = votes.filter(v => v.vote === 'no').map(v => `[${v.role}]: ${v.reasoning}`)

    const round: ConsensusRound = {
      round: roundNum,
      votes,
      yesCount,
      noCount,
      percentage,
      consensusReached: weightedPercentage >= CONSENSUS_THRESHOLD,
      dissent: dissentReasons,
    }

    rounds.push(round)
    sendSSE(res, { type: 'round_complete', round: { ...round, weightedPercentage } })

    if (round.consensusReached) break
  }

  sendSSE(res, { type: 'phase', phase: 'orchestrating' })
  sendSSE(res, { type: 'orchestrator_start' })

  const lastRound = rounds[rounds.length - 1]!
  const orchestrator = await orchestratorVerdict(rounds, evidence, activeProposal)

  const voteRecordsFinal = lastRound.votes.map(v => ({
    agentId: v.agentId,
    vote: v.vote as 'yes' | 'no',
    confidence: v.confidence,
    reasoning: v.reasoning,
    data: v.data,
  }))
  const { weightedPercentage: finalWeighted } = await reputationEngine.getWeightedConsensus(voteRecordsFinal, proposalDomain)

  const verdict: BoardroomVerdict = {
    action: orchestrator.action,
    approved: lastRound.consensusReached,
    finalPercentage: lastRound.percentage,
    totalRounds: rounds.length,
    rounds,
    orchestratorSummary: orchestrator.summary,
    params: orchestrator.params,
  }

  const session: BoardroomSession = {
    id: sessionId,
    timestamp,
    agents,
    verdict,
    evidencePackage: evidence,
  }

  sendSSE(res, { type: 'verdict', session })

  try {
    const voteRecordsForDb = lastRound.votes.map(v => ({
      agentId: v.agentId,
      vote: v.vote as 'yes' | 'no',
      confidence: v.confidence,
      reasoning: v.reasoning,
      data: v.data,
    }))
    await reputationEngine.recordSession(sessionId, activeProposal, proposalDomain, 'vote', voteRecordsForDb, {
      action: verdict.action,
      approved: verdict.approved,
      percentage: verdict.finalPercentage,
      weightedPercentage: finalWeighted,
      summary: verdict.orchestratorSummary,
    })
    await caseLawEngine.storeCaseLaw(sessionId, proposalDomain, detectRiskLevel(lastRound.votes))
  } catch {
    // non-blocking — session still valid even if DB write fails
  }

  return session
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

function detectRiskLevel(votes: AgentVote[]): string {
  const avgRisk = votes.reduce((sum, v) => {
    const risk = typeof v.data?.composite_risk === 'number' ? v.data.composite_risk : 2.5
    return sum + risk
  }, 0) / votes.length

  if (avgRisk <= 2.0) return 'low'
  if (avgRisk <= 3.5) return 'medium'
  return 'high'
}

async function orchestratorVerdict(
  rounds: ConsensusRound[],
  evidence: Record<string, unknown>,
  proposal: string
): Promise<{ summary: string; action: BoardroomVerdict['action']; params?: Record<string, unknown> }> {
  const lastRound = rounds[rounds.length - 1]
  if (!lastRound) {
    return { summary: 'No rounds completed', action: 'hold' }
  }

  const roundSummaries = rounds.map(r => {
    const voteList = r.votes.map(v => `  [${v.role}] ${v.vote.toUpperCase()} (${(v.confidence * 100).toFixed(0)}%): ${v.reasoning}`).join('\n')
    return `Round ${r.round}: ${r.yesCount}/${r.votes.length} YES (${(r.percentage * 100).toFixed(0)}%)\n${voteList}`
  }).join('\n\n')

  const prompt = `You are the Chief Judge orchestrating a DeFi AI Boardroom. 9 specialist agents have deliberated.

PROPOSAL: ${proposal}

DELIBERATION TRANSCRIPT:
${roundSummaries}

EVIDENCE SUMMARY:
${JSON.stringify(evidence, null, 2)}

FINAL CONSENSUS: ${(lastRound.percentage * 100).toFixed(0)}% agreement after ${rounds.length} round(s).
Threshold for approval: 70%.

TASK: Synthesize the deliberation and issue a final verdict.
- If consensus >= 70%: approve the specific action proposed
- If consensus < 70% after all rounds: recommend HOLD

OUTPUT FORMAT (strict JSON only):
{
  "summary": "2-3 sentence synthesis of the deliberation outcome",
  "action": "supply" | "swap" | "withdraw" | "rebalance" | "hold",
  "params": { "token": "USDC", "amount": 500, "protocol": "Aave" }
}`

  const response = await callModel(ORCHESTRATOR_MODEL, [{ role: 'user', content: prompt }], 0.2)
  const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'Deliberation complete',
      action: ['supply', 'swap', 'withdraw', 'rebalance', 'hold'].includes(parsed.action as string)
        ? parsed.action as BoardroomVerdict['action']
        : 'hold',
      params: typeof parsed.params === 'object' && parsed.params !== null
        ? parsed.params as Record<string, unknown>
        : undefined,
    }
  } catch {
    return {
      summary: lastRound.consensusReached
        ? `Consensus reached: ${(lastRound.percentage * 100).toFixed(0)}% agreement.`
        : `No consensus after ${rounds.length} round(s). Hold.`,
      action: lastRound.consensusReached ? 'supply' : 'hold',
    }
  }
}
