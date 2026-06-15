import type { AgentContext, AgentDecision } from '../agents/types.js'
import type { DebateRound } from '../agents/debate-engine.js'

/**
 * Formats debate rounds into a readable transcript string.
 * Re-exported here for prompt-building convenience.
 */
export function buildDebateTranscript(rounds: DebateRound[]): string {
  const lines: string[] = ['=== DEBATE TRANSCRIPT ===', '']

  for (const round of rounds) {
    lines.push(`--- Round ${round.round} ---`)
    lines.push(`SCOUT (confidence: ${round.scoutConfidence.toFixed(2)}):`)
    lines.push(`  ${round.scoutArgument}`)
    lines.push('')
    lines.push(`SKEPTIC (confidence: ${round.skepticConfidence.toFixed(2)}):`)
    lines.push(`  ${round.skepticChallenge}`)
    lines.push('')
  }

  const lastRound = rounds[rounds.length - 1]
  const converged = lastRound
    ? lastRound.scoutConfidence > 0.8 || lastRound.skepticConfidence < 0.3
    : false

  lines.push(`=== OUTCOME: ${converged ? 'CONVERGED' : 'NO CONSENSUS'} after ${rounds.length} round(s) ===`)

  return lines.join('\n')
}

/**
 * System prompt for the Commander Agent.
 * Instructs Venice AI to make final portfolio decisions
 * based on Scout's analysis while respecting user constraints.
 */
export const COMMANDER_SYSTEM_PROMPT = `You are the Commander Agent in a DeFi Autopilot system on Base (chain ID 8453).

Your role is to make FINAL portfolio decisions based on the Scout Agent's analysis. You are the decision-maker — the Scout observes and recommends, you decide and authorize.

DECISION AUTHORITY:
1. You receive the Scout's recommendation with its reasoning and confidence level
2. You may AGREE with the Scout's recommendation and pass it through
3. You may OVERRIDE the Scout if you identify flaws in its reasoning or if constraints are violated
4. You may DOWNGRADE confidence if the Scout seems overconfident given market conditions
5. You may choose "hold" even when the Scout recommends action, if risk is too high

CONSTRAINTS (non-negotiable):
- You MUST respect the user's strategy rules (max spend per tx, allowed tokens, thresholds)
- Never approve actions on tokens outside the allowed list
- Never approve spending more than maxSpendPerTx in a single action
- If confidence is below 0.6, default to "hold"
- When in doubt, prefer inaction over action (capital preservation)

OVERRIDE REASONS:
- Scout's confidence seems unjustified by the data
- Action violates a strategy constraint the Scout missed
- Market conditions suggest higher risk than Scout assessed
- Gas costs make the action unprofitable
- Position size is too large relative to available liquidity

OUTPUT FORMAT:
Respond with a JSON object (no markdown, no explanation outside the JSON):
{
  "action": "hold" | "swap" | "supply" | "withdraw" | "rebalance",
  "reasoning": "Clear explanation of your final decision, including whether you agreed with or overrode the Scout",
  "confidence": 0.0 to 1.0,
  "params": {
    // Same param structure as Scout's output
    // For hold: omit or {}
  }
}`

/**
 * Builds the user message for the Commander containing
 * Scout's recommendation, portfolio state, strategy constraints,
 * and optionally the full debate transcript.
 */
export function buildDecisionPrompt(
  scoutAnalysis: AgentDecision,
  context: AgentContext,
  debateTranscript?: string
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

  const paramsStr = scoutAnalysis.params
    ? JSON.stringify(scoutAnalysis.params, null, 2)
    : '(none)'

  const debateSection = debateTranscript
    ? `\nDEBATE TRANSCRIPT:\n${debateTranscript}\n`
    : ''

  return `SCOUT'S RECOMMENDATION:
  Action: ${scoutAnalysis.action}
  Confidence: ${scoutAnalysis.confidence}
  Reasoning: ${scoutAnalysis.reasoning}
  Parameters: ${paramsStr}
${debateSection}
CURRENT PORTFOLIO:
${portfolioSection || '  (empty)'}

MARKET PRICES:
${pricesSection || '  (no data)'}

STRATEGY RULES (must be respected):
  - Max spend per transaction: ${strategy.maxSpendPerTx}
  - Allowed tokens: ${strategy.allowedTokens.join(', ')}
  - Rebalance threshold: ${(strategy.rebalanceThreshold * 100).toFixed(1)}%
  - Stop-loss: ${(strategy.stopLossPercent * 100).toFixed(1)}%

Review the Scout's recommendation against the portfolio state and strategy rules. Make your final decision as a JSON object.`
}

/**
 * Parses the Commander AI response into a structured AgentDecision.
 * Handles responses wrapped in markdown code blocks.
 */
export function parseDecisionResponse(content: string): AgentDecision {
  const jsonStr = extractJson(content)
  const parsed: unknown = JSON.parse(jsonStr)

  return validateDecision(parsed)
}

const VALID_ACTIONS = new Set(['hold', 'swap', 'supply', 'withdraw', 'rebalance'])

function extractJson(content: string): string {
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0].trim()
  }

  throw new Error('No JSON object found in Commander AI response')
}

function validateDecision(parsed: unknown): AgentDecision {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Parsed response is not an object')
  }

  const obj = parsed as Record<string, unknown>

  if (typeof obj.action !== 'string' || !VALID_ACTIONS.has(obj.action)) {
    throw new Error(
      `Invalid action: "${String(obj.action)}". Must be one of: ${[...VALID_ACTIONS].join(', ')}`
    )
  }

  if (typeof obj.reasoning !== 'string' || obj.reasoning.length === 0) {
    throw new Error('Missing or empty reasoning field')
  }

  if (typeof obj.confidence !== 'number' || obj.confidence < 0 || obj.confidence > 1) {
    throw new Error(
      `Invalid confidence: ${String(obj.confidence)}. Must be a number between 0 and 1`
    )
  }

  const params =
    obj.params !== undefined && obj.params !== null
      ? validateParams(obj.params)
      : undefined

  return {
    action: obj.action as AgentDecision['action'],
    reasoning: obj.reasoning,
    confidence: obj.confidence,
    ...(params !== undefined && { params }),
  }
}

function validateParams(params: unknown): Record<string, unknown> {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new Error('params must be a plain object')
  }

  return params as Record<string, unknown>
}
