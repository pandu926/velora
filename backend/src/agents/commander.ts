import type { AgentContext, AgentDecision, AgentMessage, VeniceClient } from './types.js'
import type { DebateResult } from './debate-engine.js'
import { ActivityLog } from './activity-log.js'
import { AgentRole } from '../types/permissions.js'
import {
  parseDecisionResponse,
} from '../prompts/strategy-decision.js'

/**
 * System prompt for the Commander as final decision maker after debate.
 */
const COMMANDER_JUDGE_SYSTEM_PROMPT = `You are the Commander Agent — the FINAL decision maker in a DeFi Autopilot system on Base (chain ID 8453).

Below is a debate between Scout and Skeptic agents about a portfolio action. The Scout proposes actions based on market analysis. The Skeptic challenges with risk assessment.

YOUR ROLE:
1. Read the full debate transcript carefully
2. Summarize the key points from both sides
3. Make your FINAL decision — you may agree with Scout, side with Skeptic, or compromise
4. Your decision is authoritative and will be executed

DECISION PRINCIPLES:
- Capital preservation is the primary objective
- Only approve action when risk/reward is clearly favorable
- If the debate converged (both sides agree), honor the consensus unless you see something both missed
- If no convergence, lean toward the safer option unless Scout's evidence is compelling
- Reference specific debate points in your reasoning

CONFIDENCE SCORING:
- 0.9-1.0: Both agents agree, strong evidence, low risk
- 0.7-0.89: Good case for action, manageable risks
- 0.5-0.69: Borderline — proceed with caution or hold
- Below 0.5: Default to hold

OUTPUT FORMAT:
Respond with a JSON object (no markdown, no explanation outside the JSON):
{
  "action": "hold" | "swap" | "supply" | "withdraw" | "rebalance",
  "reasoning": "Detailed explanation referencing specific debate points",
  "confidence": 0.0 to 1.0,
  "params": {}
}`

/**
 * Commander Agent — makes final portfolio decisions based on debate results.
 *
 * The Commander receives the full debate transcript between Scout and Skeptic,
 * evaluates both sides using Venice AI, and produces a final authoritative decision.
 */
export class CommanderAgent {
  private readonly veniceClient: VeniceClient
  private readonly activityLog: ActivityLog

  constructor(
    veniceClient: VeniceClient,
    activityLog: ActivityLog
  ) {
    this.veniceClient = veniceClient
    this.activityLog = activityLog
  }

  /**
   * Evaluate a debate result and make the final decision.
   * Commander uses Venice AI to judge the debate transcript.
   */
  async evaluate(
    debateResult: DebateResult,
    context: AgentContext
  ): Promise<AgentDecision> {
    const { portfolio, strategy } = context

    const portfolioSection = portfolio
      .map(
        (t) =>
          `  - ${t.token}: balance=${t.balance}, value=$${t.valueUsd.toFixed(2)}`
      )
      .join('\n')

    const userPrompt = `DEBATE RESULT:
  Converged: ${debateResult.converged}
  Final Confidence: ${debateResult.finalConfidence.toFixed(2)}
  Scout Recommendation: ${debateResult.recommendation.action} (confidence: ${debateResult.recommendation.confidence.toFixed(2)})
  Scout Reasoning: ${debateResult.recommendation.reasoning}

${debateResult.transcript}

CURRENT PORTFOLIO:
${portfolioSection || '  (empty)'}

STRATEGY RULES (must be respected):
  - Max spend per transaction: ${strategy.maxSpendPerTx}
  - Allowed tokens: ${strategy.allowedTokens.join(', ')}
  - Rebalance threshold: ${(strategy.rebalanceThreshold * 100).toFixed(1)}%
  - Stop-loss: ${(strategy.stopLossPercent * 100).toFixed(1)}%

You are the FINAL decision maker. Summarize the key points from the debate and make your decision as a JSON object.`

    const messages: AgentMessage[] = [
      { role: 'system', content: COMMANDER_JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ]

    const response = await this.veniceClient.chat(messages)
    const responseText = response.content
    const commanderDecision = parseDecisionResponse(responseText)

    this.activityLog.add({
      agent: AgentRole.Commander,
      action: commanderDecision.action,
      reasoning: `[DEBATE JUDGE] Converged: ${debateResult.converged}. ${responseText}`,
      decision: commanderDecision,
    })

    return commanderDecision
  }
}
