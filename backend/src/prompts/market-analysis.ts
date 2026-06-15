import type { AgentContext, AgentDecision } from '../agents/types'

/**
 * System prompt for the Scout Agent.
 * Instructs Venice AI to analyze DeFi market conditions on Base
 * and produce structured JSON decisions.
 */
export const SCOUT_SYSTEM_PROMPT = `You are a DeFi market analyst agent operating on Base (chain ID 8453).

Your role is to analyze current market conditions and recommend portfolio actions. You have access to:
- Aerodrome DEX pool statistics (liquidity, volume, fees)
- Aave v3 lending/borrowing rates on Base
- Token prices and portfolio balances

DECISION FRAMEWORK:
1. Compare Aave supply APY against current portfolio allocation
2. Identify swap opportunities when token prices diverge from fair value
3. Recommend rebalancing when portfolio drift exceeds the user's threshold
4. Recommend withdrawal if stop-loss conditions are approaching
5. Default to "hold" when no clear opportunity exists with sufficient confidence

CONSTRAINTS:
- You MUST respect the user's strategy rules (max spend per tx, allowed tokens, thresholds)
- Never recommend actions on tokens outside the allowed list
- Never recommend spending more than maxSpendPerTx in a single action
- Consider gas costs (paid in USDC via 1Shot relayer) in your analysis
- Confidence must be between 0 and 1 (0 = no confidence, 1 = absolute certainty)
- Be conservative: only recommend action when confidence >= 0.6

OUTPUT FORMAT:
Respond with a JSON object (no markdown, no explanation outside the JSON):
{
  "action": "hold" | "swap" | "supply" | "withdraw" | "rebalance",
  "reasoning": "Clear explanation of why this action is recommended",
  "confidence": 0.0 to 1.0,
  "params": {
    // Optional action-specific parameters:
    // For swap: { "fromToken": "...", "toToken": "...", "amount": "..." }
    // For supply: { "token": "...", "amount": "...", "protocol": "aave" }
    // For withdraw: { "token": "...", "amount": "...", "protocol": "aave" }
    // For rebalance: { "targets": { "TOKEN": percentAllocation, ... } }
    // For hold: omit or {}
  }
}`

/**
 * Builds the user message containing current portfolio state,
 * market data, and strategy rules for the Scout to analyze.
 */
export function buildMarketAnalysisPrompt(context: AgentContext): string {
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

  return `CURRENT PORTFOLIO:
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

Analyze the above data and provide your recommendation as a JSON object.`
}

/**
 * Parses the AI response into a structured AgentDecision.
 * Handles responses wrapped in markdown code blocks.
 */
export function parseAnalysisResponse(content: string): AgentDecision {
  const jsonStr = extractJson(content)
  const parsed: unknown = JSON.parse(jsonStr)

  return validateDecision(parsed)
}

const VALID_ACTIONS = new Set(['hold', 'swap', 'supply', 'withdraw', 'rebalance'])

function extractJson(content: string): string {
  // Try to extract from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // Try to find raw JSON object in the response
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0].trim()
  }

  throw new Error('No JSON object found in AI response')
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
