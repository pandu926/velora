/**
 * Evidence Court Orchestrator — runs adversarial debate sessions where
 * every AI claim must be backed by real on-chain evidence.
 *
 * Flow: Gather evidence → Prosecution (Venice) → Defense (Venice) →
 *       Check convergence → Judge (Venice) → Verdict
 */

import crypto from 'node:crypto'
import type { VeniceInferenceClient } from '../services/venice-inference-client.js'
import type { VeniceClient } from '../services/venice-client.js'
import type { AgentContext } from '../agents/types.js'
import type { EvidenceGatherer } from './evidence-gatherer.js'
import type {
  CourtArgument,
  CourtCase,
  CourtConfig,
  DebateRound,
  Evidence,
  Verdict,
} from './types.js'
import { DEFAULT_COURT_CONFIG } from './types.js'
import {
  buildProsecutionPrompt,
  buildDefensePrompt,
  buildJudgePrompt,
  PROSECUTION_SYSTEM_PROMPT,
  DEFENSE_SYSTEM_PROMPT,
  JUDGE_SYSTEM_PROMPT,
} from './prompts.js'

/**
 * Attempts to parse a JSON CourtArgument from AI response text.
 * Handles cases where the AI wraps JSON in markdown code fences.
 */
function parseCourtArgument(raw: string): CourtArgument {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    return {
      claim: typeof parsed.claim === 'string' ? parsed.claim : 'No claim provided',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence as Evidence[] : [],
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    }
  } catch {
    // If JSON parsing fails, construct a minimal argument from the raw text
    return {
      claim: raw.slice(0, 200),
      reasoning: raw,
      evidence: [],
      confidence: 0.3,
    }
  }
}

/**
 * Attempts to parse a JSON Verdict from AI response text.
 */
function parseVerdict(raw: string): Verdict {
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    const validDecisions = new Set(['prosecution', 'defense', 'insufficient_evidence'])
    const validActions = new Set(['hold', 'swap', 'supply', 'withdraw', 'rebalance'])

    return {
      decision: validDecisions.has(parsed.decision as string)
        ? (parsed.decision as Verdict['decision'])
        : 'insufficient_evidence',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'No reasoning provided',
      evidenceScore: typeof parsed.evidenceScore === 'number'
        ? Math.max(0, Math.min(100, parsed.evidenceScore))
        : 0,
      action: validActions.has(parsed.action as string)
        ? (parsed.action as Verdict['action'])
        : 'hold',
      params: typeof parsed.params === 'object' && parsed.params !== null
        ? parsed.params as Record<string, unknown>
        : undefined,
    }
  } catch {
    return {
      decision: 'insufficient_evidence',
      reasoning: `Failed to parse judge response: ${raw.slice(0, 200)}`,
      evidenceScore: 0,
      action: 'hold',
    }
  }
}

/**
 * Formats a full court case into a human-readable transcript.
 */
function buildTranscript(rounds: DebateRound[], verdict: Verdict): string {
  const lines: string[] = []

  lines.push('═══════════════════════════════════════════')
  lines.push('         EVIDENCE COURT TRANSCRIPT         ')
  lines.push('═══════════════════════════════════════════')
  lines.push('')

  for (const round of rounds) {
    lines.push(`── Round ${round.round} ──────────────────────────────`)
    lines.push('')
    lines.push('PROSECUTION (Scout):')
    lines.push(`  Claim: ${round.prosecution.claim}`)
    lines.push(`  Confidence: ${(round.prosecution.confidence * 100).toFixed(0)}%`)
    lines.push(`  Evidence items: ${round.prosecution.evidence.length}`)
    lines.push(`  Reasoning: ${round.prosecution.reasoning}`)
    lines.push('')
    lines.push('DEFENSE (Skeptic):')
    lines.push(`  Claim: ${round.defense.claim}`)
    lines.push(`  Confidence: ${(round.defense.confidence * 100).toFixed(0)}%`)
    lines.push(`  Evidence items: ${round.defense.evidence.length}`)
    lines.push(`  Reasoning: ${round.defense.reasoning}`)
    lines.push('')
  }

  lines.push('── VERDICT ─────────────────────────────────')
  lines.push(`  Decision: ${verdict.decision.toUpperCase()}`)
  lines.push(`  Action: ${verdict.action}`)
  lines.push(`  Evidence Score: ${verdict.evidenceScore}/100`)
  lines.push(`  Reasoning: ${verdict.reasoning}`)
  lines.push('')
  lines.push('═══════════════════════════════════════════')

  return lines.join('\n')
}

export class EvidenceCourt {
  private readonly inferenceClient: VeniceInferenceClient
  private readonly veniceClient: VeniceClient
  private readonly evidenceGatherer: EvidenceGatherer
  private readonly config: CourtConfig

  constructor(
    inferenceClient: VeniceInferenceClient,
    veniceClient: VeniceClient,
    evidenceGatherer: EvidenceGatherer,
    config?: Partial<CourtConfig>
  ) {
    this.inferenceClient = inferenceClient
    this.veniceClient = veniceClient
    this.evidenceGatherer = evidenceGatherer
    this.config = { ...DEFAULT_COURT_CONFIG, ...config }
  }

  /**
   * Venice AI builds prosecution case using evidence + scout skills.
   */
  async prosecute(
    evidence: Evidence[],
    context: AgentContext,
    skills: string
  ): Promise<CourtArgument> {
    const userPrompt = buildProsecutionPrompt(evidence, context, skills)

    const response = await this.inferenceClient.chat([
      { role: 'system', content: PROSECUTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.4 })

    return parseCourtArgument(response.content)
  }

  /**
   * Venice AI builds defense using counter-evidence + skeptic skills.
   */
  async defend(
    prosecutionCase: CourtArgument,
    evidence: Evidence[],
    context: AgentContext,
    skills: string
  ): Promise<CourtArgument> {
    const userPrompt = buildDefensePrompt(prosecutionCase, evidence, context, skills)

    const response = await this.inferenceClient.chat([
      { role: 'system', content: DEFENSE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.4 })

    return parseCourtArgument(response.content)
  }

  /**
   * Venice AI evaluates evidence quality and issues verdict.
   */
  async judge(rounds: DebateRound[], skills: string): Promise<Verdict> {
    const userPrompt = buildJudgePrompt(rounds, skills)

    const response = await this.inferenceClient.chat([
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], { temperature: 0.2 })

    return parseVerdict(response.content)
  }

  /**
   * Runs a full court session: gather evidence, debate, judge.
   */
  async runCase(
    context: AgentContext,
    scoutSkills: string,
    skepticSkills: string,
    judgeSkills: string
  ): Promise<CourtCase> {
    const caseId = crypto.randomUUID()
    const startTime = Date.now()

    // 1. Gather evidence
    const portfolioAddress = context.portfolio[0]?.address as `0x${string}` | undefined
    const evidence = await this.evidenceGatherer.gatherAllEvidence({
      portfolioAddress,
    })

    const rounds: DebateRound[] = []
    let converged = false

    for (let roundNum = 1; roundNum <= this.config.maxRounds; roundNum++) {
      // 2. Prosecution presents (Scout via Venice)
      const prosecution = await this.prosecute(evidence, context, scoutSkills)

      // 3. Defense challenges (Skeptic via Venice)
      const defense = await this.defend(prosecution, evidence, context, skepticSkills)

      rounds.push({ round: roundNum, prosecution, defense })

      // 4. Check convergence
      const prosecutionStrong = prosecution.confidence >= this.config.convergenceThreshold
      const defenseWeak = defense.confidence < (1 - this.config.convergenceThreshold)

      if (prosecutionStrong || defenseWeak) {
        converged = true
        break
      }
    }

    // 5. Judge evaluates all rounds (Venice AI)
    let verdict = await this.judge(rounds, judgeSkills)

    // 6. Safety mechanism: low evidence score = hold
    if (verdict.evidenceScore < this.config.minEvidenceScore) {
      verdict = {
        ...verdict,
        decision: 'insufficient_evidence',
        action: 'hold',
        reasoning: `Evidence score ${verdict.evidenceScore}/100 below minimum threshold of ${this.config.minEvidenceScore}. Original reasoning: ${verdict.reasoning}`,
      }
    }

    // 7. Build transcript
    const transcript = buildTranscript(rounds, verdict)

    return {
      id: caseId,
      timestamp: startTime,
      rounds,
      verdict,
      converged,
      totalRounds: rounds.length,
      transcript,
    }
  }
}
