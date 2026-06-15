import type { AgentContext, AgentDecision, AgentMessage } from './types.js'
import type { VeniceInferenceClient } from '../services/venice-inference-client.js'
import type { ActivityLog } from './activity-log.js'
import { AgentRole } from '../types/permissions.js'
import {
  SKEPTIC_SYSTEM_PROMPT,
  buildChallengePrompt,
  parseChallengeResponse,
  type SkepticChallengeResult,
} from '../prompts/skeptic-analysis.js'

/**
 * Skeptic Agent — the adversary that challenges every proposal from Scout.
 *
 * The Skeptic finds weaknesses, quantifies risks, proposes safer alternatives,
 * and concedes points where the proposal is genuinely strong.
 * Uses Venice AI for research and debate.
 */
export class SkepticAgent {
  private readonly veniceClient: VeniceInferenceClient
  private readonly activityLog: ActivityLog

  constructor(veniceClient: VeniceInferenceClient, activityLog: ActivityLog) {
    this.veniceClient = veniceClient
    this.activityLog = activityLog
  }

  /**
   * Challenge a proposal from the Scout Agent.
   * Returns counter-arguments, risk score, a safer alternative, and concessions.
   */
  async challenge(
    proposal: AgentDecision,
    context: AgentContext
  ): Promise<SkepticChallengeResult> {
    const messages: AgentMessage[] = [
      { role: 'system', content: SKEPTIC_SYSTEM_PROMPT },
      { role: 'user', content: buildChallengePrompt(proposal, context) },
    ]

    const response = await this.veniceClient.chat(messages)
    const responseText = response.content
    const result = parseChallengeResponse(responseText)

    this.activityLog.add({
      agent: AgentRole.RiskGuardian,
      action: `challenge:${proposal.action}`,
      reasoning: `Risk Score: ${result.riskScore}/100. Counter-arguments: ${result.counterArguments.join(' | ')}. Concessions: ${result.concessions.join(' | ')}`,
      decision: result.alternativeAction,
    })

    return result
  }
}
