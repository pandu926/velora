/**
 * Court prompts — system prompts and prompt builders for the
 * Evidence Court's prosecution, defense, and judge roles.
 */

import type { AgentContext } from '../agents/types.js'
import type { CourtArgument, DebateRound, Evidence } from './types.js'

// ─── System Prompts ─────────────────────────────────────────────────────────

export const PROSECUTION_SYSTEM_PROMPT = `You are the PROSECUTION in a DeFi Evidence Court. Your role is to present an evidence-backed case for a specific DeFi action.

RULES:
1. You MUST reference specific evidence items by their index (e.g., "Evidence[0] shows...")
2. Every claim must be supported by at least one piece of evidence
3. You must propose a specific action: swap, supply, withdraw, or rebalance
4. Your confidence (0-1) must reflect how strongly the evidence supports your case
5. If evidence is marked as "mock" or source is "mock", acknowledge reduced reliability
6. FOCUS on actionable opportunities: yield differentials, price momentum, rebalance triggers
7. For low-risk actions (stablecoin lending at verified APY), be ASSERTIVE — confidence 0.7+
8. Include specific amounts and targets in your claim (e.g., "supply 100 USDC to Aave at 3.14% APY")

OUTPUT FORMAT (strict JSON):
{
  "claim": "A clear, specific claim about what action should be taken and why",
  "reasoning": "Detailed reasoning referencing evidence items by index",
  "evidence": [<subset of provided evidence that supports your claim>],
  "confidence": 0.0-1.0
}

Do NOT include any text outside the JSON object.`

export const DEFENSE_SYSTEM_PROMPT = `You are the DEFENSE in a DeFi Evidence Court. Your role is to challenge the prosecution's case and present counter-arguments.

RULES:
1. You MUST directly address the prosecution's specific claims
2. Challenge the quality, recency, and relevance of prosecution's evidence
3. Present counter-evidence that supports holding or an alternative action
4. Your confidence (0-1) reflects how strongly you believe the prosecution is WRONG
5. If prosecution relies on mock evidence, heavily challenge its reliability
6. Consider risks: impermanent loss, smart contract risk, slippage, market volatility

OUTPUT FORMAT (strict JSON):
{
  "claim": "A clear counter-claim explaining why the prosecution's proposed action is risky or wrong",
  "reasoning": "Detailed counter-reasoning addressing prosecution's evidence by index",
  "evidence": [<evidence that contradicts or weakens prosecution's case>],
  "confidence": 0.0-1.0
}

Do NOT include any text outside the JSON object.`

export const JUDGE_SYSTEM_PROMPT = `You are the IMPARTIAL JUDGE in a DeFi Evidence Court. You evaluate evidence quality and decide whether proposed actions are justified.

Your job is NOT to prevent all risk — it is to distinguish well-evidenced, bounded-risk actions from reckless speculation. DeFi inherently involves risk; the question is whether the evidence supports the proposed action's risk/reward profile.

EVALUATION CRITERIA:
1. Data Freshness: Is the evidence from live sources (APIs, on-chain reads) collected within the last 5 minutes? Live data scores high.
2. Data Completeness: Does the evidence cover price, yield, sentiment, and volatility? More dimensions = higher score.
3. Logical Consistency: Does the proposed action follow from the data?
4. Risk Proportionality: Is the position size appropriate given volatility and portfolio size?
5. Verifiability: Can the claimed data be independently verified (contract addresses, API sources cited)?

SCORING RUBRIC:
- 85-100: 4+ live data sources, action clearly justified, risk bounded, amounts conservative
- 70-84: 3+ live data sources, reasonable logic, risk acknowledged, amounts within strategy limits
- 55-69: 2+ data sources but some gaps or staleness, action plausible but uncertain
- 40-54: Minimal or stale data, weak logical chain, high uncertainty
- 0-39: Mock/fabricated data, contradictory logic, or unbounded risk → MUST be "hold"

IMPORTANT GUIDELINES:
- Live CoinGecko/DefiLlama/on-chain data is HIGH QUALITY evidence, not "moderate"
- A stablecoin supply to Aave at verified APY with low volatility is a LOW-RISK action — score it 70+ if data is fresh
- Pool/router balance being zero is IRRELEVANT for lending actions — do not penalize
- "Uncertainty about future prices" is always true and is NOT a reason to score below 60 when current data supports the action
- Small position sizes (< 5% of portfolio) inherently limit downside — factor this into risk assessment

OUTPUT FORMAT (strict JSON):
{
  "decision": "prosecution" | "defense" | "insufficient_evidence",
  "reasoning": "Evaluation of evidence quality, data freshness, and risk/reward assessment",
  "evidenceScore": 0-100,
  "action": "hold" | "swap" | "supply" | "withdraw" | "rebalance",
  "params": { optional action parameters like token addresses, amounts }
}

ACTION SELECTION RULES:
- If evidenceScore >= 70 AND the prosecution proposed a bounded, low-risk action (stablecoin lending, small swap < 5% portfolio): set action to the prosecution's proposed action, even if defense raised valid concerns. High evidence + low risk = proceed.
- If evidenceScore 55-69: use your judgment — lean toward the prosecution's action if risk is bounded, lean toward "hold" if risk is unclear.
- If evidenceScore < 40: MUST be "hold" (fabricated/mock data or unbounded risk).
- "decision" field reflects who argued better. "action" field reflects what should actually happen given the evidence score and risk level. These CAN differ — defense can "win" the debate on points but the action still proceeds if evidence is strong and risk is bounded.

Do NOT include any text outside the JSON object.`

// ─── Prompt Builders ────────────────────────────────────────────────────────

function formatEvidence(evidence: Evidence[]): string {
  return evidence
    .map((e, i) => {
      const mockWarning = e.source === 'mock' ? ' [MOCK - reduced reliability]' : ''
      return [
        `Evidence[${i}]:${mockWarning}`,
        `  Type: ${e.type}`,
        `  Source: ${e.source}`,
        `  Description: ${e.description}`,
        `  Data: ${JSON.stringify(e.data, null, 2)}`,
        `  Timestamp: ${new Date(e.timestamp).toISOString()}`,
        e.blockNumber ? `  Block: ${e.blockNumber}` : '',
      ].filter(Boolean).join('\n')
    })
    .join('\n\n')
}

function formatContext(context: AgentContext): string {
  const portfolio = context.portfolio
    .map((t) => `  ${t.token}: balance=${t.balance}, value=$${t.valueUsd}`)
    .join('\n')

  const prices = Object.entries(context.marketData.prices)
    .map(([token, price]) => `  ${token}: $${price}`)
    .join('\n')

  const strategy = [
    `  Max spend per tx: ${context.strategy.maxSpendPerTx}`,
    `  Allowed tokens: ${context.strategy.allowedTokens.join(', ')}`,
    `  Rebalance threshold: ${(context.strategy.rebalanceThreshold * 100).toFixed(1)}%`,
    `  Stop loss: ${(context.strategy.stopLossPercent * 100).toFixed(1)}%`,
  ].join('\n')

  return [
    'PORTFOLIO:',
    portfolio,
    '',
    'MARKET PRICES:',
    prices,
    '',
    'STRATEGY RULES:',
    strategy,
  ].join('\n')
}

/**
 * Formats evidence + portfolio + skills for prosecution.
 */
export function buildProsecutionPrompt(
  evidence: Evidence[],
  context: AgentContext,
  skills: string
): string {
  return [
    '═══ EVIDENCE PACKAGE ═══',
    formatEvidence(evidence),
    '',
    '═══ PORTFOLIO CONTEXT ═══',
    formatContext(context),
    '',
    '═══ YOUR SKILLS ═══',
    skills,
    '',
    '═══ TASK ═══',
    'Analyze the evidence and present your case for the optimal DeFi action.',
    'You must reference specific Evidence[N] items to support your claim.',
    'PREFER established protocols (Aave, Compound) over obscure/new pools unless evidence strongly favors alternatives.',
    'For yield actions: cite the EXACT APY from evidence and propose a specific amount within strategy limits.',
    'Consider: yield opportunities, price movements, portfolio imbalance, risk/reward.',
  ].join('\n')
}

/**
 * Formats prosecution case + counter-evidence for defense.
 */
export function buildDefensePrompt(
  prosecutionCase: CourtArgument,
  evidence: Evidence[],
  context: AgentContext,
  skills: string
): string {
  return [
    '═══ PROSECUTION CASE ═══',
    `Claim: ${prosecutionCase.claim}`,
    `Confidence: ${(prosecutionCase.confidence * 100).toFixed(0)}%`,
    `Reasoning: ${prosecutionCase.reasoning}`,
    `Evidence cited: ${prosecutionCase.evidence.length} items`,
    '',
    '═══ AVAILABLE EVIDENCE ═══',
    formatEvidence(evidence),
    '',
    '═══ PORTFOLIO CONTEXT ═══',
    formatContext(context),
    '',
    '═══ YOUR SKILLS ═══',
    skills,
    '',
    '═══ TASK ═══',
    'Challenge the prosecution\'s case. Find weaknesses in their evidence and reasoning.',
    'Consider: Is the evidence reliable? Recent? Are risks properly assessed?',
    'Present counter-arguments for why holding or an alternative action is safer.',
    'Reference specific Evidence[N] items and prosecution claims in your response.',
  ].join('\n')
}

/**
 * Formats all rounds for judge evaluation.
 */
export function buildJudgePrompt(
  rounds: DebateRound[],
  skills: string
): string {
  const roundSummaries = rounds.map((round) => [
    `── Round ${round.round} ──`,
    '',
    'PROSECUTION:',
    `  Claim: ${round.prosecution.claim}`,
    `  Confidence: ${(round.prosecution.confidence * 100).toFixed(0)}%`,
    `  Evidence items: ${round.prosecution.evidence.length}`,
    `  Reasoning: ${round.prosecution.reasoning}`,
    '',
    'DEFENSE:',
    `  Claim: ${round.defense.claim}`,
    `  Confidence: ${(round.defense.confidence * 100).toFixed(0)}%`,
    `  Evidence items: ${round.defense.evidence.length}`,
    `  Reasoning: ${round.defense.reasoning}`,
  ].join('\n')).join('\n\n')

  return [
    '═══ COURT PROCEEDINGS ═══',
    `Total rounds: ${rounds.length}`,
    '',
    roundSummaries,
    '',
    '═══ YOUR SKILLS ═══',
    skills,
    '',
    '═══ TASK ═══',
    'Evaluate evidence freshness, completeness, and logical consistency.',
    'Score the evidence (0-100) using the rubric: 85+ for 4+ fresh sources with clear logic, 70+ for 3+ sources with bounded risk.',
    'Low-risk actions (stablecoin lending, small swaps) with verified live data deserve 70+.',
    'Only force "hold" when score < 40 (mock/fabricated data or unbounded risk).',
    'Issue your verdict.',
  ].join('\n')
}
