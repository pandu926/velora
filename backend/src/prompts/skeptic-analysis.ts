import type { AgentContext, AgentDecision } from '../agents/types.js'

/**
 * System prompt for the Skeptic Agent.
 * Instructs Venice AI to act as an adversary — finding weaknesses,
 * quantifying risks, and proposing safer alternatives.
 */
export const SKEPTIC_SYSTEM_PROMPT = `You are the Skeptic Agent in a DeFi Autopilot system on Base (chain ID 8453).

Your role is ADVERSARIAL: you challenge every proposal from the Scout Agent. Your job is to find weaknesses, hidden risks, and flaws in the proposed action. You are the devil's advocate.

CHALLENGE FRAMEWORK:
1. SLIPPAGE RISK: Is the proposed trade size too large relative to pool liquidity? Calculate expected slippage.
2. TIMING RISK: Is this the right moment? Check for upcoming events, low liquidity periods, or momentum against the trade.
3. OPPORTUNITY COST: What is being given up? Could the capital earn more elsewhere?
4. HIDDEN COSTS: Gas fees (USDC via 1Shot), price impact, protocol fees — do they eat the expected gain?
5. CORRELATION RISK: Does this action increase portfolio concentration or correlation?
6. SMART CONTRACT RISK: Is the protocol battle-tested? Any recent exploits or governance concerns?
7. LIQUIDITY RISK: Can the position be exited quickly if needed?

RULES:
- Be SPECIFIC with numbers. Not "might be risky" but "expected slippage of 0.8% on $500 trade in a $5M pool"
- Quantify the downside scenario (worst case loss in USD terms)
- Always propose a SAFER alternative (even if it's "hold and wait for better conditions")
- You MUST concede points where the proposal is genuinely strong — intellectual honesty matters
- Your risk score should reflect actual danger: 0 = no risk, 100 = catastrophic risk
- Don't be contrarian for its own sake — if the proposal is solid, say so (but still find the weak points)

OUTPUT FORMAT:
Respond with a JSON object (no markdown, no explanation outside the JSON):
{
  "counterArguments": ["specific weakness 1 with numbers", "specific weakness 2 with numbers", ...],
  "riskScore": 0 to 100,
  "alternativeAction": {
    "action": "hold" | "swap" | "supply" | "withdraw" | "rebalance",
    "reasoning": "Why this alternative is safer",
    "confidence": 0.0 to 1.0,
    "params": {}
  },
  "concessions": ["point where the proposal is strong", ...]
}`

/**
 * Builds the user message for the Skeptic containing the Scout's proposal
 * and full market context for adversarial analysis.
 */
export function buildChallengePrompt(
  proposal: AgentDecision,
  context: AgentContext
): string {
  const { portfolio, marketData, strategy } = context

  const portfolioSection = portfolio
    .map(
      (t) =>
        `  - ${t.token} (${t.address}): balance=${t.balance}, value=$${t.valueUsd.toFixed(2)}`
    )
    .join('\n')

  const pricesSection = Object.entries(marketData.prices)
    .map(([token, price]) => `  - ${token}: $${price.toFixed(4)}`)
    .join('\n')

  const aaveSection = Object.entries(marketData.aaveRates)
    .map(
      ([token, rates]) =>
        `  - ${token}: supply APY=${(rates.supply * 100).toFixed(2)}%, borrow APY=${(rates.borrow * 100).toFixed(2)}%`
    )
    .join('\n')

  const liquiditySection = Object.entries(marketData.poolLiquidity)
    .map(([pool, liquidity]) => `  - ${pool}: $${liquidity.toLocaleString()}`)
    .join('\n')

  const paramsStr = proposal.params
    ? JSON.stringify(proposal.params, null, 2)
    : '(none)'

  return `PROPOSAL TO CHALLENGE:
  Action: ${proposal.action}
  Confidence: ${proposal.confidence}
  Reasoning: ${proposal.reasoning}
  Parameters: ${paramsStr}

CURRENT PORTFOLIO:
${portfolioSection || '  (empty)'}

MARKET PRICES:
${pricesSection || '  (no data)'}

AAVE V3 RATES (Base):
${aaveSection || '  (no data)'}

AERODROME POOL LIQUIDITY:
${liquiditySection || '  (no data)'}

STRATEGY RULES:
  - Max spend per transaction: ${strategy.maxSpendPerTx}
  - Allowed tokens: ${strategy.allowedTokens.join(', ')}
  - Rebalance threshold: ${(strategy.rebalanceThreshold * 100).toFixed(1)}%
  - Stop-loss: ${(strategy.stopLossPercent * 100).toFixed(1)}%

Challenge this proposal. Find weaknesses, quantify risks, and propose a safer alternative. Respond as JSON.`
}

/**
 * Parses the Skeptic AI response into a structured challenge result.
 */
export interface SkepticChallengeResult {
  counterArguments: string[]
  riskScore: number
  alternativeAction: AgentDecision
  concessions: string[]
}

export function parseChallengeResponse(content: string): SkepticChallengeResult {
  const jsonStr = extractJson(content)
  const parsed: unknown = JSON.parse(jsonStr)

  return validateChallengeResult(parsed)
}

function extractJson(content: string): string {
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0].trim()
  }

  throw new Error('No JSON object found in Skeptic AI response')
}

const VALID_ACTIONS = new Set(['hold', 'swap', 'supply', 'withdraw', 'rebalance'])

function validateChallengeResult(parsed: unknown): SkepticChallengeResult {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Parsed Skeptic response is not an object')
  }

  const obj = parsed as Record<string, unknown>

  if (!Array.isArray(obj.counterArguments)) {
    throw new Error('Missing or invalid counterArguments array')
  }

  const counterArguments = obj.counterArguments.filter(
    (arg): arg is string => typeof arg === 'string'
  )

  if (typeof obj.riskScore !== 'number' || obj.riskScore < 0 || obj.riskScore > 100) {
    throw new Error(
      `Invalid riskScore: ${String(obj.riskScore)}. Must be a number between 0 and 100`
    )
  }

  if (typeof obj.alternativeAction !== 'object' || obj.alternativeAction === null) {
    throw new Error('Missing or invalid alternativeAction')
  }

  const alt = obj.alternativeAction as Record<string, unknown>

  if (typeof alt.action !== 'string' || !VALID_ACTIONS.has(alt.action)) {
    throw new Error(`Invalid alternative action: "${String(alt.action)}"`)
  }

  const concessions = Array.isArray(obj.concessions)
    ? obj.concessions.filter((c): c is string => typeof c === 'string')
    : []

  return {
    counterArguments,
    riskScore: obj.riskScore,
    alternativeAction: {
      action: alt.action as AgentDecision['action'],
      reasoning: typeof alt.reasoning === 'string' ? alt.reasoning : 'No reasoning provided',
      confidence: typeof alt.confidence === 'number' ? alt.confidence : 0.5,
      ...(alt.params && typeof alt.params === 'object' && !Array.isArray(alt.params)
        ? { params: alt.params as Record<string, unknown> }
        : {}),
    },
    concessions,
  }
}
