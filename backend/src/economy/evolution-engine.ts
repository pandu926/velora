import { prisma } from '../db/client.js'
import { BOARDROOM_AGENTS, VENICE_BASE_URL, VENICE_API_KEY } from '../court/boardroom-types.js'

const EVOLUTION_TRIGGER_SESSIONS = 30
const MIN_REPUTATION_TO_KEEP = 35
const MAX_REPLACEMENTS_PER_CYCLE = 2
const MIN_SESSIONS_BEFORE_REPLACE = 30

const MODEL_POOL = [
  'deepseek-ai/DeepSeek-V3.1',
  'Qwen/Qwen3-32B',
  'qwen3.6-plus',
  'gemini-3.1-pro',
  'llama-3.1-70b',
  'claude-sonnet-4-6',
  'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B',
]

interface EvolutionCandidate {
  id: string
  role: string
  model: string
  reputation: number
  accuracy: number
  compositeScore: number
  declining: boolean
}

interface EvolutionResult {
  cycleNumber: number
  replacements: Array<{
    oldAgent: { id: string; model: string; score: number }
    newAgent: { id: string; model: string }
    reason: string
  }>
  skipped: string[]
}

export class EvolutionEngine {
  async shouldTriggerEvolution(): Promise<boolean> {
    const totalOutcomes = await prisma.outcome.count()
    const lastEvolution = await prisma.evolutionEvent.findFirst({ orderBy: { createdAt: 'desc' } })

    if (!lastEvolution) return totalOutcomes >= EVOLUTION_TRIGGER_SESSIONS

    const outcomesSinceLastEvolution = await prisma.outcome.count({
      where: { createdAt: { gt: lastEvolution.createdAt } },
    })

    return outcomesSinceLastEvolution >= EVOLUTION_TRIGGER_SESSIONS
  }

  async evaluateAgents(): Promise<EvolutionCandidate[]> {
    const agents = await prisma.agent.findMany({
      where: { isActive: true },
      include: { specializations: true, reputationHistory: { orderBy: { createdAt: 'desc' }, take: 10 } },
    })

    return agents.map(agent => {
      const avgSpecialization = agent.specializations.length > 0
        ? agent.specializations.reduce((sum, s) => sum + s.accuracy, 0) / agent.specializations.length
        : 0.5

      const varianceHealth = this.calculateVarianceHealth(agent.reputationHistory.map(e => e.delta))

      const compositeScore =
        (agent.reputation * 0.4) +
        (agent.accuracy * 100 * 0.3) +
        (avgSpecialization * 100 * 0.2) +
        (varianceHealth * 0.1)

      const declining = agent.reputationHistory.length >= 10 &&
        agent.reputationHistory.every(e => e.delta < 0)

      return {
        id: agent.id,
        role: agent.role,
        model: agent.model,
        reputation: agent.reputation,
        accuracy: agent.accuracy,
        compositeScore,
        declining,
      }
    }).sort((a, b) => a.compositeScore - b.compositeScore)
  }

  private calculateVarianceHealth(deltas: number[]): number {
    if (deltas.length < 3) return 50

    const positives = deltas.filter(d => d > 0).length
    const ratio = positives / deltas.length
    return ratio * 100
  }

  async runEvolutionCycle(): Promise<EvolutionResult> {
    const lastCycle = await prisma.evolutionEvent.findFirst({ orderBy: { cycleNumber: 'desc' } })
    const cycleNumber = (lastCycle?.cycleNumber ?? 0) + 1

    const ranked = await this.evaluateAgents()
    const replacements: EvolutionResult['replacements'] = []
    const skipped: string[] = []

    const recentlyAdded = await prisma.evolutionEvent.findMany({
      where: { cycleNumber: cycleNumber - 1 },
      select: { newAgentId: true },
    })
    const protectedIds = new Set(recentlyAdded.map(e => e.newAgentId))

    const currentModels = new Set(ranked.map(a => a.model))
    const availableModels = MODEL_POOL.filter(m => !currentModels.has(m))

    for (const candidate of ranked) {
      if (replacements.length >= MAX_REPLACEMENTS_PER_CYCLE) break
      if (protectedIds.has(candidate.id)) {
        skipped.push(`${candidate.id} (protected — added last cycle)`)
        continue
      }

      const shouldReplace = candidate.reputation <= MIN_REPUTATION_TO_KEEP || candidate.declining

      if (!shouldReplace) {
        skipped.push(`${candidate.id} (rep ${candidate.reputation.toFixed(1)} > ${MIN_REPUTATION_TO_KEEP})`)
        continue
      }

      if (availableModels.length === 0) {
        skipped.push(`${candidate.id} (no models available in pool)`)
        continue
      }

      const newModel = availableModels.shift()!
      const newStrategy = await this.generateNewStrategy(candidate.role, newModel)
      const newAgentId = `${candidate.id}-v${cycleNumber}`

      await prisma.$transaction([
        prisma.agent.update({
          where: { id: candidate.id },
          data: { isActive: false, replacedAt: new Date(), replacedBy: newAgentId },
        }),
        prisma.agent.create({
          data: {
            id: newAgentId,
            role: candidate.role,
            model: newModel,
            description: newStrategy,
            reputation: 50,
            evolutionCycle: cycleNumber,
          },
        }),
        prisma.evolutionEvent.create({
          data: {
            cycleNumber,
            replacedAgentId: candidate.id,
            replacedModel: candidate.model,
            newAgentId,
            newModel,
            reason: candidate.declining
              ? `Declining trend: ${candidate.reputation.toFixed(1)} rep, all recent deltas negative`
              : `Low reputation: ${candidate.reputation.toFixed(1)} (threshold: ${MIN_REPUTATION_TO_KEEP})`,
            performanceBefore: candidate.compositeScore,
          },
        }),
      ])

      replacements.push({
        oldAgent: { id: candidate.id, model: candidate.model, score: candidate.compositeScore },
        newAgent: { id: newAgentId, model: newModel },
        reason: candidate.declining ? 'declining_trend' : 'low_reputation',
      })
    }

    return { cycleNumber, replacements, skipped }
  }

  private async generateNewStrategy(role: string, model: string): Promise<string> {
    try {
      const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${VENICE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-V4-Flash',
          messages: [{
            role: 'user',
            content: `Generate a one-sentence expertise description for a DeFi AI agent with role "${role}" running on model "${model}". Focus on what makes this agent's analytical approach unique. Max 100 characters. Return only the description, no quotes.`,
          }],
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) return `${role} specialist powered by ${model}`
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      return data.choices?.[0]?.message?.content?.trim().slice(0, 150) ?? `${role} specialist powered by ${model}`
    } catch {
      return `${role} specialist powered by ${model}`
    }
  }

  async getEvolutionHistory(limit = 10): Promise<Array<{
    cycleNumber: number
    replacedAgentId: string
    replacedModel: string
    newAgentId: string
    newModel: string
    reason: string
    performanceBefore: number
    performanceAfter: number | null
    createdAt: Date
  }>> {
    return prisma.evolutionEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  async updatePostEvolutionPerformance(cycleNumber: number): Promise<void> {
    const events = await prisma.evolutionEvent.findMany({ where: { cycleNumber } })

    for (const event of events) {
      const newAgent = await prisma.agent.findUnique({ where: { id: event.newAgentId } })
      if (!newAgent || newAgent.totalSessions < 10) continue

      const avgSpec = await prisma.specialization.aggregate({
        where: { agentId: event.newAgentId },
        _avg: { accuracy: true },
      })

      const compositeScore =
        (newAgent.reputation * 0.4) +
        (newAgent.accuracy * 100 * 0.3) +
        ((avgSpec._avg.accuracy ?? 0.5) * 100 * 0.2) +
        (50 * 0.1)

      await prisma.evolutionEvent.update({
        where: { id: event.id },
        data: { performanceAfter: compositeScore },
      })
    }
  }
}

export const evolutionEngine = new EvolutionEngine()
