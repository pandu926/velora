import type { AgentContext, AgentDecision, AgentMessage } from './types'
import type { VeniceInferenceClient } from '../services/venice-inference-client.js'
import {
  SCOUT_SYSTEM_PROMPT,
  buildMarketAnalysisPrompt,
  parseAnalysisResponse,
} from '../prompts/market-analysis'

/**
 * Scout Agent — analyzes market conditions via Venice AI.
 *
 * The Scout is read-only: it observes portfolio state and market data,
 * then produces actionable recommendations. It never executes transactions.
 */
export class ScoutAgent {
  private readonly veniceClient: VeniceInferenceClient

  constructor(veniceClient: VeniceInferenceClient) {
    this.veniceClient = veniceClient
  }

  /**
   * Analyze current market conditions and portfolio state.
   * Returns a structured decision with the full AI reasoning.
   */
  async analyze(
    context: AgentContext
  ): Promise<{ decision: AgentDecision; reasoning: string }> {
    const messages: AgentMessage[] = [
      { role: 'system', content: SCOUT_SYSTEM_PROMPT },
      { role: 'user', content: buildMarketAnalysisPrompt(context) },
    ]

    const response = await this.veniceClient.chat(messages)
    const responseText = response.content
    const decision = parseAnalysisResponse(responseText)

    return {
      decision,
      reasoning: responseText,
    }
  }
}
