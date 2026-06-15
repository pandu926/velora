import type { AgentContext, AgentDecision, AgentMessage } from './types.js'
import type { ScoutAgent } from './scout.js'
import type { SkepticAgent } from './skeptic.js'
import type { VeniceInferenceClient, VeniceMessage } from '../services/venice-inference-client.js'

/**
 * A single round of debate between Scout and Skeptic with adaptive convergence.
 */
export interface DebateRound {
  round: number
  scoutArgument: string
  scoutConfidence: number
  skepticChallenge: string
  skepticConfidence: number
}

/**
 * The result of an adaptive multi-round debate.
 */
export interface DebateResult {
  rounds: DebateRound[]
  converged: boolean
  finalConfidence: number
  transcript: string
  recommendation: AgentDecision
}

const MAX_ROUNDS = 4
const SCOUT_CONVERGENCE_THRESHOLD = 0.8
const SKEPTIC_CONVERGENCE_THRESHOLD = 0.3

/**
 * Debate Engine — orchestrates adaptive multi-round debates between Scout and Skeptic.
 *
 * Uses Venice AI for internal debate reasoning. Adaptive convergence:
 * - Stops when Scout confidence > 0.8 OR Skeptic confidence < 0.3
 * - Max 4 rounds
 * - Returns full transcript for Commander to judge
 */
export class DebateEngine {
  private readonly veniceClient: VeniceInferenceClient
  private readonly scoutAgent: ScoutAgent
  private readonly skepticAgent: SkepticAgent

  constructor(
    veniceClient: VeniceInferenceClient,
    scoutAgent: ScoutAgent,
    skepticAgent: SkepticAgent
  ) {
    this.veniceClient = veniceClient
    this.scoutAgent = scoutAgent
    this.skepticAgent = skepticAgent
  }

  /**
   * Run an adaptive debate between Scout and Skeptic.
   * Converges when Scout confidence > 0.8 OR Skeptic confidence < 0.3.
   * Max 4 rounds.
   */
  async debate(context: AgentContext): Promise<DebateResult> {
    const rounds: DebateRound[] = []

    // Round 1: Scout analyzes
    const scoutResult = await this.scoutAgent.analyze(context)
    const scoutConfidence = scoutResult.decision.confidence

    // Round 1: Skeptic challenges
    const challenge = await this.skepticAgent.challenge(scoutResult.decision, context)
    const skepticConfidence = challenge.riskScore / 100

    const round1: DebateRound = {
      round: 1,
      scoutArgument: scoutResult.decision.reasoning,
      scoutConfidence,
      skepticChallenge: challenge.counterArguments.join('. '),
      skepticConfidence,
    }
    rounds.push(round1)

    // Check convergence after round 1
    if (this.hasConverged(scoutConfidence, skepticConfidence)) {
      return this.buildResult(rounds, true, scoutResult.decision)
    }

    // Subsequent rounds: Scout rebuts, Skeptic re-challenges
    let currentScoutConfidence = scoutConfidence
    let currentSkepticConfidence = skepticConfidence
    let currentRecommendation = scoutResult.decision

    for (let roundNum = 2; roundNum <= MAX_ROUNDS; roundNum++) {
      // Scout rebuts via Venice
      const rebuttal = await this.getScoutRebuttal(
        currentRecommendation,
        rounds[rounds.length - 1].skepticChallenge,
        context
      )

      // Skeptic re-challenges via Venice
      const reChallenge = await this.getSkepticReChallenge(
        rebuttal.argument,
        currentRecommendation,
        context
      )

      currentScoutConfidence = rebuttal.confidence
      currentSkepticConfidence = reChallenge.confidence

      const round: DebateRound = {
        round: roundNum,
        scoutArgument: rebuttal.argument,
        scoutConfidence: currentScoutConfidence,
        skepticChallenge: reChallenge.challenge,
        skepticConfidence: currentSkepticConfidence,
      }
      rounds.push(round)

      // Check convergence
      if (this.hasConverged(currentScoutConfidence, currentSkepticConfidence)) {
        return this.buildResult(rounds, true, currentRecommendation)
      }
    }

    // Max rounds reached without convergence
    return this.buildResult(rounds, false, currentRecommendation)
  }

  private hasConverged(scoutConfidence: number, skepticConfidence: number): boolean {
    return scoutConfidence > SCOUT_CONVERGENCE_THRESHOLD || skepticConfidence < SKEPTIC_CONVERGENCE_THRESHOLD
  }

  private buildResult(
    rounds: DebateRound[],
    converged: boolean,
    recommendation: AgentDecision
  ): DebateResult {
    const lastRound = rounds[rounds.length - 1]
    const finalConfidence = converged
      ? lastRound.scoutConfidence
      : (lastRound.scoutConfidence + (1 - lastRound.skepticConfidence)) / 2

    return {
      rounds,
      converged,
      finalConfidence,
      transcript: buildDebateTranscript(rounds),
      recommendation,
    }
  }

  /**
   * Scout rebuts the Skeptic's challenge via Venice AI.
   */
  private async getScoutRebuttal(
    proposal: AgentDecision,
    skepticChallenge: string,
    context: AgentContext
  ): Promise<{ argument: string; confidence: number }> {
    const messages: VeniceMessage[] = [
      {
        role: 'system',
        content: `You are the Scout Agent defending your DeFi proposal. Address the Skeptic's challenge with evidence. Be intellectually honest — concede where valid.

Respond with JSON:
{
  "argument": "Your rebuttal addressing the challenge",
  "confidence": 0.0 to 1.0
}`,
      },
      {
        role: 'user',
        content: `YOUR PROPOSAL:
  Action: ${proposal.action}
  Reasoning: ${proposal.reasoning}
  Original Confidence: ${proposal.confidence}

SKEPTIC'S CHALLENGE:
  ${skepticChallenge}

PORTFOLIO VALUE: $${context.portfolio.reduce((sum, t) => sum + t.valueUsd, 0).toFixed(2)}
MARKET PRICES: ${JSON.stringify(context.marketData.prices)}

Defend or adjust your position. Respond as JSON.`,
      },
    ]

    const response = await this.veniceClient.chat(messages)
    const parsed = this.parseJsonResponse<{ argument: string; confidence: number }>(
      response.content,
      { argument: response.content, confidence: proposal.confidence }
    )

    return {
      argument: typeof parsed.argument === 'string' ? parsed.argument : response.content,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : proposal.confidence,
    }
  }

  /**
   * Skeptic re-challenges after Scout's rebuttal via Venice AI.
   */
  private async getSkepticReChallenge(
    scoutRebuttal: string,
    proposal: AgentDecision,
    context: AgentContext
  ): Promise<{ challenge: string; confidence: number }> {
    const messages: VeniceMessage[] = [
      {
        role: 'system',
        content: `You are the Skeptic Agent re-evaluating a DeFi proposal after the Scout's rebuttal. Your job is to find remaining risks. If the rebuttal adequately addresses your concerns, lower your confidence (risk assessment).

Respond with JSON:
{
  "challenge": "Your remaining concerns or acknowledgment that risks are addressed",
  "confidence": 0.0 to 1.0 (how risky you still think this is — lower means Scout convinced you)
}`,
      },
      {
        role: 'user',
        content: `ORIGINAL PROPOSAL:
  Action: ${proposal.action}
  Reasoning: ${proposal.reasoning}

SCOUT'S REBUTTAL:
  ${scoutRebuttal}

PORTFOLIO VALUE: $${context.portfolio.reduce((sum, t) => sum + t.valueUsd, 0).toFixed(2)}
POOL LIQUIDITY: ${JSON.stringify(context.marketData.poolLiquidity)}

Re-evaluate the risk. Respond as JSON.`,
      },
    ]

    const response = await this.veniceClient.chat(messages)
    const parsed = this.parseJsonResponse<{ challenge: string; confidence: number }>(
      response.content,
      { challenge: response.content, confidence: 0.5 }
    )

    return {
      challenge: typeof parsed.challenge === 'string' ? parsed.challenge : response.content,
      confidence: typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
    }
  }

  /**
   * Safely parse JSON from AI response, with fallback.
   */
  private parseJsonResponse<T>(content: string, fallback: T): T {
    try {
      const jsonStr = extractJson(content)
      return JSON.parse(jsonStr) as T
    } catch {
      return fallback
    }
  }
}

/**
 * Formats debate rounds into a readable transcript for the Commander.
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
  const converged =
    lastRound.scoutConfidence > SCOUT_CONVERGENCE_THRESHOLD ||
    lastRound.skepticConfidence < SKEPTIC_CONVERGENCE_THRESHOLD

  lines.push(`=== OUTCOME: ${converged ? 'CONVERGED' : 'NO CONSENSUS'} after ${rounds.length} round(s) ===`)

  return lines.join('\n')
}

/**
 * Extracts JSON from a response that may be wrapped in markdown code blocks.
 */
function extractJson(content: string): string {
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    return jsonMatch[0].trim()
  }

  return content
}
