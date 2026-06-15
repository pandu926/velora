import { prisma } from '../db/client.js'
import { VENICE_BASE_URL, VENICE_API_KEY } from '../court/boardroom-types.js'
import { evolutionEngine } from './evolution-engine.js'

interface ModelInfo {
  id: string
  name: string
  provider: string
}

interface BenchmarkResult {
  modelId: string
  correctVotes: number
  totalReplayed: number
  accuracy: number
  avgConfidence: number
}

export class AutoReplacementPipeline {
  async discoverNewModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${VENICE_BASE_URL}/models`, {
        headers: { 'Authorization': `Bearer ${VENICE_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      })

      if (!res.ok) return []

      const data = await res.json() as { data?: Array<{ id: string; owned_by?: string }> }
      const models = data.data ?? []

      const currentAgents = await prisma.agent.findMany({ where: { isActive: true }, select: { model: true } })
      const currentModels = new Set(currentAgents.map(a => a.model))

      return models
        .filter(m => !currentModels.has(m.id))
        .filter(m => !m.id.includes('embedding') && !m.id.includes('whisper'))
        .map(m => ({ id: m.id, name: m.id.split('/').pop() ?? m.id, provider: m.owned_by ?? 'unknown' }))
    } catch {
      return []
    }
  }

  async benchmarkModel(modelId: string, role: string): Promise<BenchmarkResult | null> {
    const historicalSessions = await prisma.session.findMany({
      where: { outcome: { isNot: null } },
      include: { votes: true, outcome: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    if (historicalSessions.length < 5) return null

    let correctVotes = 0
    let totalReplayed = 0
    let totalConfidence = 0

    for (const session of historicalSessions) {
      const outcome = session.outcome!.result
      const approved = session.verdictAction !== 'hold'

      try {
        const response = await this.replayVote(modelId, role, session.proposal)
        if (!response) continue

        totalReplayed++
        totalConfidence += response.confidence

        const voteCorrect = this.isVoteCorrect(response.vote, approved, outcome)
        if (voteCorrect) correctVotes++
      } catch {
        continue
      }
    }

    if (totalReplayed < 3) return null

    return {
      modelId,
      correctVotes,
      totalReplayed,
      accuracy: correctVotes / totalReplayed,
      avgConfidence: totalConfidence / totalReplayed,
    }
  }

  private async replayVote(modelId: string, role: string, proposal: string): Promise<{ vote: string; confidence: number } | null> {
    const prompt = `You are the ${role} in a DeFi AI Boardroom. A proposal was made:

PROPOSAL: ${proposal}

Based on your expertise, would you vote YES or NO? Respond in JSON:
{"vote":"yes"|"no","confidence":0.0-1.0}`

    try {
      const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${VENICE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) return null

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      const raw = data.choices?.[0]?.message?.content ?? ''

      const jsonMatch = raw.match(/\{[\s\S]*"vote"[\s\S]*\}/)
      if (!jsonMatch) return null

      const parsed = JSON.parse(jsonMatch[0]) as { vote?: string; confidence?: number }
      return {
        vote: parsed.vote === 'yes' ? 'yes' : 'no',
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      }
    } catch {
      return null
    }
  }

  private isVoteCorrect(vote: string, approved: boolean, outcome: string): boolean {
    if (outcome === 'neutral') return true
    if (approved) {
      return (vote === 'yes' && outcome === 'profit') || (vote === 'no' && outcome === 'loss')
    }
    return (vote === 'no' && outcome === 'loss') || (vote === 'yes' && outcome === 'profit')
  }

  async runAutoCheck(): Promise<{
    checkedModels: number
    benchmarkedModels: number
    replacementCandidates: Array<{ targetAgent: string; candidateModel: string; benchmarkAccuracy: number; currentAccuracy: number }>
    evolutionTriggered: boolean
  }> {
    const newModels = await this.discoverNewModels()

    const underperformingAgents = await prisma.agent.findMany({
      where: {
        isActive: true,
        OR: [
          { reputation: { lt: 30 } },
          { accuracy: { lt: 0.4 } },
        ],
      },
      orderBy: { reputation: 'asc' },
      take: 2,
    })

    if (underperformingAgents.length === 0) {
      return { checkedModels: newModels.length, benchmarkedModels: 0, replacementCandidates: [], evolutionTriggered: false }
    }

    const candidates: Array<{ targetAgent: string; candidateModel: string; benchmarkAccuracy: number; currentAccuracy: number }> = []
    let benchmarkedCount = 0

    for (const agent of underperformingAgents) {
      const modelsToTest = newModels.slice(0, 3)

      for (const model of modelsToTest) {
        benchmarkedCount++
        const result = await this.benchmarkModel(model.id, agent.role)
        if (!result) continue

        if (result.accuracy > agent.accuracy + 0.2) {
          candidates.push({
            targetAgent: agent.id,
            candidateModel: model.id,
            benchmarkAccuracy: result.accuracy,
            currentAccuracy: agent.accuracy,
          })
        }
      }
    }

    let evolutionTriggered = false
    if (candidates.length > 0) {
      const shouldTrigger = await evolutionEngine.shouldTriggerEvolution()
      if (shouldTrigger) {
        await evolutionEngine.runEvolutionCycle()
        evolutionTriggered = true
      }
    }

    return { checkedModels: newModels.length, benchmarkedModels: benchmarkedCount, replacementCandidates: candidates, evolutionTriggered }
  }
}

export const autoReplacementPipeline = new AutoReplacementPipeline()
