import crypto from 'node:crypto'
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
    body: JSON.stringify({ model, messages, temperature, stream: false }),
  })

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown')
    throw new Error(`Model ${model} failed (${response.status}): ${err}`)
  }

  const data = await response.json() as Record<string, unknown>
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
  return choices?.[0]?.message?.content ?? ''
}

function buildAgentPrompt(agent: BoardroomAgent, evidence: Record<string, unknown>, proposal: string, round: number, dissent?: string[]): string {
  const dissentContext = round > 1 && dissent?.length
    ? `\n\nDISSENT FROM PREVIOUS ROUND (agents who voted NO):\n${dissent.join('\n')}\n\nConsider their arguments. You may change your vote if convinced.`
    : ''

  return `You are the ${agent.role} in a DeFi AI Boardroom. Your expertise: ${agent.description}.

PROPOSAL: ${proposal}

EVIDENCE PACKAGE:
${JSON.stringify(evidence, null, 2)}
${dissentContext}

IMPORTANT GUIDELINES:
- Vote based on YOUR role's expertise and the evidence provided
- A stablecoin supply to a battle-tested protocol (Aave, Compound) at verified APY is LOW RISK
- "Fear & Greed" being low means buying/lending opportunity, not reason to avoid all action
- Small position sizes (< 50% of holdings) inherently limit downside
- If the evidence supports the action and risk is bounded, vote YES
- Vote NO only if you find specific, concrete evidence AGAINST the action from your domain

TASK: Analyze the proposal using your expertise. Vote YES or NO.

OUTPUT FORMAT (strict JSON only, no other text):
{
  "vote": "yes" or "no",
  "confidence": 0.0-1.0,
  "reasoning": "One paragraph explaining your vote based on your role's expertise",
  "data": { "key_metric": "value you found most relevant from evidence" }
}`
}

function parseAgentResponse(raw: string, agent: BoardroomAgent): AgentVote {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  const jsonMatch = cleaned.match(/\{[\s\S]*"vote"[\s\S]*\}/)
  const jsonStr = jsonMatch ? jsonMatch[0] : cleaned

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    return {
      agentId: agent.id,
      role: agent.role,
      model: agent.model,
      vote: parsed.vote === 'yes' ? 'yes' : 'no',
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
      data: typeof parsed.data === 'object' && parsed.data !== null ? parsed.data as Record<string, unknown> : {},
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
    }
  }
}

async function runVotingRound(
  agents: BoardroomAgent[],
  evidence: Record<string, unknown>,
  proposal: string,
  round: number,
  dissent?: string[]
): Promise<ConsensusRound> {
  const votePromises = agents.map(async (agent): Promise<AgentVote> => {
    try {
      const prompt = buildAgentPrompt(agent, evidence, proposal, round, dissent)
      const response = await callModel(agent.model, [
        { role: 'user', content: prompt },
      ])
      return parseAgentResponse(response, agent)
    } catch (error) {
      return {
        agentId: agent.id,
        role: agent.role,
        model: agent.model,
        vote: 'no',
        confidence: 0,
        reasoning: `Agent unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
        data: {},
      }
    }
  })

  const votes = await Promise.all(votePromises)
  const yesCount = votes.filter(v => v.vote === 'yes').length
  const noCount = votes.filter(v => v.vote === 'no').length
  const percentage = yesCount / votes.length

  const dissentReasons = votes
    .filter(v => v.vote === 'no')
    .map(v => `[${v.role}]: ${v.reasoning}`)

  return {
    round,
    votes,
    yesCount,
    noCount,
    percentage,
    consensusReached: percentage >= CONSENSUS_THRESHOLD,
    dissent: dissentReasons,
  }
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

  const response = await callModel(ORCHESTRATOR_MODEL, [
    { role: 'user', content: prompt },
  ], 0.2)

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
        ? `Consensus reached: ${(lastRound.percentage * 100).toFixed(0)}% agreement after ${rounds.length} round(s).`
        : `No consensus after ${rounds.length} round(s). Recommending hold.`,
      action: lastRound.consensusReached ? 'supply' : 'hold',
    }
  }
}

export async function runBoardroomSession(proposal?: string): Promise<BoardroomSession> {
  const sessionId = crypto.randomUUID()
  const timestamp = Date.now()
  const agents = BOARDROOM_AGENTS

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

  const defaultProposal = 'Supply 500 USDC (27% of USDC holdings) to Aave v3 on Base at ~3.2% APY. Aave is battle-tested with $500M+ TVL on Base. Position is withdrawable anytime.'
  const activeProposal = proposal || defaultProposal

  const rounds: ConsensusRound[] = []

  for (let roundNum = 1; roundNum <= MAX_ROUNDS; roundNum++) {
    const dissent = roundNum > 1 ? rounds[roundNum - 2]?.dissent : undefined
    const round = await runVotingRound(agents, evidence, activeProposal, roundNum, dissent)
    rounds.push(round)

    if (round.consensusReached) break
  }

  const lastRound = rounds[rounds.length - 1]!
  const orchestrator = await orchestratorVerdict(rounds, evidence, activeProposal)

  const verdict: BoardroomVerdict = {
    action: orchestrator.action,
    approved: lastRound.consensusReached,
    finalPercentage: lastRound.percentage,
    totalRounds: rounds.length,
    rounds,
    orchestratorSummary: orchestrator.summary,
    params: orchestrator.params,
  }

  return {
    id: sessionId,
    timestamp,
    agents,
    verdict,
    evidencePackage: evidence,
  }
}
