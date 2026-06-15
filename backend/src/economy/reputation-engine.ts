import { prisma } from '../db/client.js'
import { BOARDROOM_AGENTS } from '../court/boardroom-types.js'
import { specializationEngine } from './specialization-engine.js'

interface ReputationBreakdown {
  accuracyScore: number
  confidenceScore: number
  dataQualityScore: number
  peerScore: number
  varianceBonus: number
  total: number
}

interface VoteRecord {
  agentId: string
  vote: 'yes' | 'no'
  confidence: number
  reasoning: string
  data: Record<string, unknown>
}

export class ReputationEngine {
  async initialize(): Promise<void> {
    for (const agent of BOARDROOM_AGENTS) {
      await prisma.agent.upsert({
        where: { id: agent.id },
        update: { model: agent.model, description: agent.description },
        create: {
          id: agent.id,
          role: agent.role,
          model: agent.model,
          description: agent.description,
          reputation: 50,
        },
      })
    }
  }

  async getAgentWeights(): Promise<Record<string, number>> {
    const agents = await prisma.agent.findMany({ where: { isActive: true } })
    const weights: Record<string, number> = {}

    for (const agent of agents) {
      weights[agent.id] = Math.min(2.0, agent.reputation / 50)
    }

    return weights
  }

  async getWeightedConsensus(votes: VoteRecord[], domain?: string): Promise<{ percentage: number; weightedPercentage: number }> {
    const weights = await this.getAgentWeights()

    let totalWeight = 0
    let yesWeight = 0

    for (const v of votes) {
      const baseWeight = weights[v.agentId] ?? 1
      const finalWeight = domain
        ? await specializationEngine.getWeightWithSpecialization(v.agentId, baseWeight, domain)
        : baseWeight

      totalWeight += finalWeight
      if (v.vote === 'yes') yesWeight += finalWeight
    }

    const yesCount = votes.filter(v => v.vote === 'yes').length
    const percentage = yesCount / votes.length
    const weightedPercentage = totalWeight > 0 ? yesWeight / totalWeight : 0

    return { percentage, weightedPercentage }
  }

  async recordSession(
    sessionId: string,
    proposal: string,
    domain: string,
    mode: string,
    votes: VoteRecord[],
    verdict: { action: string; approved: boolean; percentage: number; weightedPercentage: number; summary: string },
    userAddress?: string
  ): Promise<void> {
    await prisma.session.create({
      data: {
        id: sessionId,
        proposal,
        proposalDomain: domain,
        mode,
        consensusReached: verdict.approved,
        finalPercentage: verdict.percentage,
        weightedPercentage: verdict.weightedPercentage,
        verdictAction: verdict.action,
        orchestratorSummary: verdict.summary,
        userAddress: userAddress?.toLowerCase() ?? null,
        votes: {
          create: votes.map(v => ({
            agentId: v.agentId,
            vote: v.vote,
            confidence: v.confidence,
            reasoning: v.reasoning,
            dataPayload: v.data as object,
            compositeRisk: typeof v.data?.composite_risk === 'number' ? v.data.composite_risk : null,
          })),
        },
      },
    })

    for (const agent of await prisma.agent.findMany({ where: { isActive: true } })) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { totalSessions: { increment: 1 } },
      })
    }
  }

  async recordOutcome(
    sessionId: string,
    result: 'profit' | 'loss' | 'neutral',
    valueDelta?: number,
    notes?: string
  ): Promise<void> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { votes: true },
    })

    if (!session) throw new Error(`Session ${sessionId} not found`)

    await prisma.outcome.upsert({
      where: { sessionId },
      update: { result, valueDelta, measuredAt: new Date(), notes, userOverride: true },
      create: {
        sessionId,
        result,
        valueDelta,
        measuredAt: new Date(),
        measureMethod: 'manual',
        userOverride: true,
        scheduledAt: new Date(),
        notes,
      },
    })

    await this.updateReputations(session.id, result, session.verdictAction ?? 'hold', session.votes)
  }

  private async updateReputations(
    sessionId: string,
    outcome: 'profit' | 'loss' | 'neutral',
    verdictAction: string,
    votes: Array<{ agentId: string; vote: string; confidence: number; reasoning: string; dataPayload: unknown }>
  ): Promise<void> {
    const approved = verdictAction !== 'hold'
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { proposalDomain: true } })
    const domain = session?.proposalDomain ?? 'general'

    for (const vote of votes) {
      const wasCorrect = this.determineCorrectness(vote.vote, approved, outcome)
      const breakdown = this.calculateBreakdown(vote, wasCorrect, outcome, votes)

      const agent = await prisma.agent.findUnique({ where: { id: vote.agentId } })
      if (!agent) continue

      const newReputation = Math.max(0, Math.min(100, agent.reputation + breakdown.total))

      await prisma.$transaction([
        prisma.vote.update({
          where: { sessionId_agentId: { sessionId, agentId: vote.agentId } },
          data: { wasCorrect, reputationDelta: breakdown.total },
        }),
        prisma.agent.update({
          where: { id: vote.agentId },
          data: {
            reputation: newReputation,
            correctCalls: wasCorrect ? { increment: 1 } : undefined,
            incorrectCalls: !wasCorrect ? { increment: 1 } : undefined,
            accuracy: agent.totalSessions > 0
              ? (agent.correctCalls + (wasCorrect ? 1 : 0)) / agent.totalSessions
              : 0,
          },
        }),
        prisma.reputationEvent.create({
          data: {
            agentId: vote.agentId,
            sessionId,
            delta: breakdown.total,
            reason: wasCorrect ? 'Correct vote' : 'Incorrect vote',
            reputationAfter: newReputation,
            breakdown: breakdown as object,
          },
        }),
      ])

      await specializationEngine.updateSpecialization(vote.agentId, domain, wasCorrect)
    }
  }

  private determineCorrectness(vote: string, actionApproved: boolean, outcome: string): boolean {
    if (outcome === 'neutral') return true

    if (actionApproved) {
      return (vote === 'yes' && outcome === 'profit') || (vote === 'no' && outcome === 'loss')
    }

    return (vote === 'no' && outcome === 'loss') || (vote === 'yes' && outcome === 'profit')
  }

  private calculateBreakdown(
    vote: { vote: string; confidence: number; reasoning: string; dataPayload: unknown },
    wasCorrect: boolean,
    outcome: string,
    allVotes: Array<{ vote: string }>
  ): ReputationBreakdown {
    const accuracyScore = wasCorrect ? 8 : -12
    const highConf = vote.confidence >= 0.7
    const confidenceScore = highConf
      ? (wasCorrect ? 4 : -6)
      : (wasCorrect ? 1 : -1)

    const hasData = vote.dataPayload != null && Object.keys(vote.dataPayload as object).length > 0
    const dataQualityScore = hasData ? 2 : 0

    const majorityVote = allVotes.filter(v => v.vote === vote.vote).length > allVotes.length / 2
    const loneDissent = !majorityVote && allVotes.filter(v => v.vote === vote.vote).length <= 2
    let peerScore = majorityVote ? 1 : 0
    if (loneDissent && wasCorrect) peerScore = 6
    if (loneDissent && !wasCorrect) peerScore = -3

    const varianceBonus = 0

    const total = (accuracyScore + confidenceScore + dataQualityScore + peerScore + varianceBonus) / 5

    return { accuracyScore, confidenceScore, dataQualityScore, peerScore, varianceBonus, total }
  }

  async getLeaderboard(): Promise<Array<{
    id: string
    role: string
    model: string
    reputation: number
    accuracy: number
    totalSessions: number
    weight: number
  }>> {
    const agents = await prisma.agent.findMany({
      where: { isActive: true },
      orderBy: { reputation: 'desc' },
    })

    return agents.map(a => ({
      id: a.id,
      role: a.role,
      model: a.model,
      reputation: Number(a.reputation.toFixed(1)),
      accuracy: Number((a.accuracy * 100).toFixed(1)),
      totalSessions: a.totalSessions,
      weight: Number(Math.min(2.0, a.reputation / 50).toFixed(2)),
    }))
  }

  async getReputationHistory(agentId: string, limit = 20): Promise<Array<{
    delta: number
    reason: string
    reputationAfter: number
    createdAt: Date
  }>> {
    return prisma.reputationEvent.findMany({
      where: { agentId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { delta: true, reason: true, reputationAfter: true, createdAt: true },
    })
  }
}

export const reputationEngine = new ReputationEngine()
