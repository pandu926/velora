import crypto from 'node:crypto'
import type { Response } from 'express'
import {
  BOARDROOM_AGENTS,
  CONSENSUS_THRESHOLD,
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
import type { UserProfile } from './boardroom-stream.js'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface DebateMessage {
  agentId: string
  role: string
  model: string
  content: string
  respondsTo?: string
  type: 'proposal' | 'challenge' | 'support' | 'data' | 'synthesis'
}

interface DebateRound {
  messages: DebateMessage[]
  moderatorNote: string
}

async function callModel(model: string, messages: ChatMessage[], temperature = 0.5, webSearch = false): Promise<string> {
  const body: Record<string, unknown> = { model, messages, temperature, stream: false }
  if (webSearch) {
    body.tools = [{ type: 'web_search' }]
  }

  const response = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VENICE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    const err = await response.text().catch(() => 'unknown')
    throw new Error(`Model ${model} failed (${response.status}): ${err}`)
  }

  const data = await response.json() as Record<string, unknown>
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined
  return choices?.[0]?.message?.content ?? ''
}

function sendSSE(res: Response, event: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`)
}

function buildDebateContext(evidence: Record<string, unknown>, proposal: string, history: DebateMessage[], userProfile?: UserProfile): string {
  const historyStr = history.map(m =>
    `[${m.role}] (${m.type}): ${m.content}`
  ).join('\n\n')

  const evidenceStr = JSON.stringify(evidence, null, 1)
  const trimmedEvidence = evidenceStr.length > 2500 ? evidenceStr.slice(0, 2500) + '\n...' : evidenceStr

  const profileStr = userProfile
    ? `\nUSER PROFILE: ${userProfile.persona} (${userProfile.riskAppetite}), threshold ${Math.round(userProfile.recommendedThreshold * 100)}%, max position ${userProfile.maxPositionPct}%`
    : ''

  return `PROPOSAL: ${proposal}
${profileStr}

EVIDENCE:
${trimmedEvidence}

DISCUSSION SO FAR:
${historyStr || '(opening statement — you speak first)'}`
}

function buildAgentDebatePrompt(agent: BoardroomAgent, context: string, instruction: string): string {
  return `You are ${agent.role} in a DeFi AI Boardroom debate. Expertise: ${agent.description}.
You have web search capability — you can cite real-time data from the internet to support your arguments.

${context}

${instruction}

RULES:
- Respond directly to other agents' arguments (name them)
- Cite specific data from evidence OR from web search to support your point
- Be concise: 2-3 sentences max
- If you agree with someone, say so and add new insight
- If you disagree, explain WHY with data
- Use real-time web data when the evidence package lacks info

Respond in plain text (no JSON). Be direct and conversational, like a real meeting.`
}

function buildModeratorPrompt(context: string, history: DebateMessage[], roundNum: number): string {
  return `You are the Moderator (Claude Sonnet) of a DeFi AI Boardroom. ${history.length} statements have been made in round ${roundNum}.

${context}

Your job:
1. Identify where agents AGREE and DISAGREE
2. If consensus is forming → call for final objections
3. If deadlocked → ask a specific agent to respond to a specific point
4. After sufficient debate → declare verdict

Respond with a JSON object:
{
  "note": "1-2 sentence moderator observation",
  "action": "continue" | "final_round" | "verdict",
  "nextSpeaker": "agent-id to speak next (if continue)",
  "challengeTo": "what specific point to address (if continue)",
  "verdict": { "action": "supply|swap|hold|withdraw", "approved": true|false, "reasoning": "why", "params": {} }
}`
}

export async function runDebateStreaming(res: Response, proposal?: string, userProfile?: UserProfile): Promise<void> {
  const sessionId = crypto.randomUUID()
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
  }

  if (userProfile) {
    evidence['user_profile'] = {
      risk_appetite: userProfile.riskAppetite,
      persona: userProfile.persona,
      max_position_pct: userProfile.maxPositionPct,
    }
  }

  const defaultProposal = 'Supply 500 USDC (27% of holdings) to Aave v3 on Base at ~3.2% APY'
  const activeProposal = proposal || defaultProposal

  sendSSE(res, { type: 'phase', phase: 'debating' })
  sendSSE(res, { type: 'proposal', proposal: activeProposal })

  const history: DebateMessage[] = []
  const speakOrder = ['market-analyst', 'risk-officer', 'yield-researcher', 'protocol-analyst', 'technical-auditor', 'quant-strategist', 'sentiment-analyst', 'macro-analyst', 'onchain-analyst']

  let roundNum = 0
  let maxRounds = 4
  let verdictReached = false

  while (roundNum < maxRounds && !verdictReached) {
    roundNum++
    sendSSE(res, { type: 'round_start', round: roundNum })

    const speakersThisRound = roundNum === 1
      ? speakOrder.slice(0, 5)
      : speakOrder.slice(0, 3)

    for (const agentId of speakersThisRound) {
      const agent = agents.find(a => a.id === agentId)
      if (!agent) continue

      sendSSE(res, { type: 'agent_speaking', agentId: agent.id, role: agent.role, model: agent.model })

      const context = buildDebateContext(evidence, activeProposal, history, userProfile)

      let instruction: string
      if (history.length === 0) {
        instruction = 'You open the discussion. State your position on the proposal based on your expertise and the evidence.'
      } else {
        const lastFew = history.slice(-3)
        const recentPoints = lastFew.map(m => `${m.role}: "${m.content.slice(0, 80)}"`).join('; ')
        instruction = `Recent discussion: ${recentPoints}. Respond to these points from your expertise. Agree, challenge, or add new data.`
      }

      try {
        const prompt = buildAgentDebatePrompt(agent, context, instruction)
        const response = await callModel(agent.model, [{ role: 'user', content: prompt }], 0.5, true)
        const content = response.replace(/```/g, '').trim().slice(0, 300)

        const msg: DebateMessage = {
          agentId: agent.id,
          role: agent.role,
          model: agent.model,
          content,
          respondsTo: history.length > 0 ? history[history.length - 1].agentId : undefined,
          type: roundNum === 1 && history.length < 2 ? 'proposal' : 'challenge',
        }

        history.push(msg)
        sendSSE(res, { type: 'agent_message', message: msg })
      } catch (error) {
        sendSSE(res, { type: 'agent_message', message: {
          agentId: agent.id,
          role: agent.role,
          model: agent.model,
          content: `[unavailable: ${error instanceof Error ? error.message.slice(0, 50) : 'error'}]`,
          type: 'data',
        }})
      }
    }

    sendSSE(res, { type: 'moderator_thinking' })

    const modContext = buildDebateContext(evidence, activeProposal, history, userProfile)
    const modPrompt = buildModeratorPrompt(modContext, history, roundNum)

    try {
      const modResponse = await callModel(ORCHESTRATOR_MODEL, [{ role: 'user', content: modPrompt }], 0.2)
      const cleaned = modResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*"action"[\s\S]*\}/)

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
        const action = parsed.action as string
        const note = typeof parsed.note === 'string' ? parsed.note : ''

        sendSSE(res, { type: 'moderator_note', note, action, round: roundNum })

        if (action === 'verdict' && parsed.verdict) {
          const v = parsed.verdict as Record<string, unknown>
          sendSSE(res, {
            type: 'final_verdict',
            verdict: {
              action: v.action || 'hold',
              approved: v.approved ?? false,
              reasoning: v.reasoning || note,
              params: v.params || {},
            },
            sessionId,
            totalRounds: roundNum,
            totalMessages: history.length,
          })
          verdictReached = true
        } else if (action === 'final_round') {
          maxRounds = roundNum + 1
        }
      }
    } catch {
      sendSSE(res, { type: 'moderator_note', note: 'Continuing discussion...', action: 'continue', round: roundNum })
    }
  }

  if (!verdictReached) {
    sendSSE(res, {
      type: 'final_verdict',
      verdict: {
        action: 'hold',
        approved: false,
        reasoning: `No consensus after ${roundNum} rounds of deliberation. Holding.`,
        params: {},
      },
      sessionId,
      totalRounds: roundNum,
      totalMessages: history.length,
    })
  }
}
