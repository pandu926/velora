import type { AgentContext } from '../agents/types.js'
import type { DebateRound } from '../agents/debate-engine.js'

/**
 * System prompt for the Commander acting as debate Judge.
 * Instructs Venice AI to weigh both sides impartially and make a final ruling.
 */
export const JUDGE_SYSTEM_PROMPT = `You are the Judge (Commander Agent) in a DeFi Autopilot debate system on Base (chain ID 8453).

You have just witnessed a structured debate between the Scout (proposer) and the Skeptic (challenger) about a portfolio action. Your role is to make the FINAL decision by weighing both sides impartially.

JUDGMENT FRAMEWORK:
1. Read the full debate transcript carefully
2. Evaluate the strength of each argument — who provided better evidence?
3. Consider confidence levels — is the risk justified by the potential reward?
4. Factor in historical lessons from past decisions (if provided)
5. Make a FINAL decision that may be:
   a) AGREE with Scout — the proposal is sound despite challenges
   b) AGREE with Skeptic — the risks outweigh the benefits, default to hold
   c) COMPROMISE — modify the proposal to address Skeptic's concerns (e.g., reduce size, change timing)

DECISION PRINCIPLES:
- Capital preservation is the primary objective
- Only approve action when the risk/reward ratio is clearly favorable
- If the debate converged, honor it unless you see something both missed
- If no convergence, lean toward the safer option unless Scout's evidence is compelling
- Reference specific debate points in your reasoning
- Consider lessons from past decisions — avoid repeating mistakes

CONFIDENCE SCORING:
- 0.9-1.0: Both agents agree, strong evidence, low risk
- 0.7-0.89: Good case for action, manageable risks identified
- 0.5-0.69: Borderline — proceed with caution or hold
- Below 0.5: Default to hold

OUTPUT FORMAT:
Respond with a JSON object (no markdown, no explanation outside the JSON):
{
  "action": "hold" | "swap" | "supply" | "withdraw" | "rebalance",
  "reasoning": "Detailed explanation referencing specific debate points and lessons",
  "confidence": 0.0 to 1.0,
  "params": {}
}`

/**
 * Builds the judgment prompt containing the full debate transcript,
 * historical lessons, and current context.
 */
export function buildJudgmentPrompt(
  debateRounds: DebateRound[],
  lessons: string[],
  context: AgentContext
): string {
  const { portfolio, strategy } = context

  const portfolioSection = portfolio
    .map(
      (t) =>
        `  - ${t.token}: balance=${t.balance}, value=$${t.valueUsd.toFixed(2)}`
    )
    .join('\n')

  const debateSection = debateRounds
    .map((round) => {
      return `--- Round ${round.round} ---
SCOUT (confidence: ${round.scoutConfidence.toFixed(2)}):
  Argument: ${round.scoutArgument}

SKEPTIC (confidence: ${round.skepticConfidence.toFixed(2)}):
  Challenge: ${round.skepticChallenge}`
    })
    .join('\n\n')

  const lessonsSection =
    lessons.length > 0
      ? lessons.map((l, i) => `  ${i + 1}. ${l}`).join('\n')
      : '  (no historical lessons yet)'

  return `DEBATE TRANSCRIPT:
${debateSection}

CURRENT PORTFOLIO:
${portfolioSection || '  (empty)'}

STRATEGY RULES:
  - Max spend per transaction: ${strategy.maxSpendPerTx}
  - Allowed tokens: ${strategy.allowedTokens.join(', ')}
  - Rebalance threshold: ${(strategy.rebalanceThreshold * 100).toFixed(1)}%
  - Stop-loss: ${(strategy.stopLossPercent * 100).toFixed(1)}%

LESSONS FROM PAST DECISIONS:
${lessonsSection}

Based on the debate above and historical lessons, make your final judgment as a JSON object.`
}
