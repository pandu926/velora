import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { prisma } from '../db/client.js'

const router: RouterType = Router()

/**
 * GET /api/public/leaderboard
 * Public endpoint — no auth needed. Returns instance stats and agent rankings.
 */
router.get('/leaderboard', async (_req: Request, res: Response) => {
  try {
    const agents = await prisma.agent.findMany({
      where: { isActive: true },
      include: { specializations: true },
      orderBy: { reputation: 'desc' },
    })

    const totalSessions = await prisma.session.count()
    const outcomes = await prisma.outcome.findMany({ select: { result: true, valueDelta: true } })

    const overallPnL = outcomes.reduce((sum, o) => sum + (o.valueDelta ?? 0), 0)
    const profitCount = outcomes.filter(o => o.result === 'profit').length
    const lossCount = outcomes.filter(o => o.result === 'loss').length

    const evolutionEvents = await prisma.evolutionEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    })

    const agentData = agents.map(a => {
      const specs: Record<string, number> = {}
      for (const s of a.specializations) {
        specs[s.domain] = Number((s.accuracy * 100).toFixed(1))
      }

      return {
        role: a.role,
        model: a.model,
        reputation: Number(a.reputation.toFixed(1)),
        accuracy: Number((a.accuracy * 100).toFixed(1)),
        totalSessions: a.totalSessions,
        weight: Number(Math.min(2.0, a.reputation / 50).toFixed(2)),
        specializations: specs,
        evolutionCycle: a.evolutionCycle,
      }
    })

    const evolutionHistory = evolutionEvents.map(e => ({
      cycle: e.cycleNumber,
      replaced: e.replacedModel.split('/').pop(),
      with: e.newModel.split('/').pop(),
      reason: e.reason.split(':')[0],
      performanceBefore: e.performanceBefore,
      performanceAfter: e.performanceAfter,
      date: e.createdAt,
    }))

    res.json({
      instanceId: 'velora-prod-001',
      name: 'Velora DeFi Autopilot',
      style: 'Balanced',
      consensusThreshold: 0.70,
      totalSessions,
      totalOutcomes: outcomes.length,
      overallPnL: `${overallPnL >= 0 ? '+' : ''}$${overallPnL.toFixed(2)}`,
      winRate: outcomes.length > 0 ? Number(((profitCount / outcomes.length) * 100).toFixed(1)) : 0,
      profitCount,
      lossCount,
      neutralCount: outcomes.length - profitCount - lossCount,
      agents: agentData,
      evolutionHistory,
      lastUpdated: new Date().toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/public/agent/:agentId
 * Public agent detail with full history.
 */
router.get('/agent/:agentId', async (req: Request, res: Response) => {
  const agentId = req.params['agentId'] as string

  try {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        specializations: true,
        reputationHistory: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    })

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' })
      return
    }

    const recentVotes = await prisma.vote.findMany({
      where: { agentId },
      orderBy: { session: { createdAt: 'desc' } },
      take: 20,
      include: { session: { select: { proposal: true, proposalDomain: true, verdictAction: true, createdAt: true } } },
    })

    res.json({
      id: agent.id,
      role: agent.role,
      model: agent.model,
      description: agent.description,
      reputation: agent.reputation,
      accuracy: Number((agent.accuracy * 100).toFixed(1)),
      totalSessions: agent.totalSessions,
      correctCalls: agent.correctCalls,
      incorrectCalls: agent.incorrectCalls,
      isActive: agent.isActive,
      evolutionCycle: agent.evolutionCycle,
      specializations: agent.specializations.map(s => ({
        domain: s.domain,
        accuracy: Number((s.accuracy * 100).toFixed(1)),
        sampleSize: s.sampleSize,
        confidence: Number(s.confidence.toFixed(2)),
      })),
      reputationHistory: agent.reputationHistory.map(e => ({
        delta: e.delta,
        reason: e.reason,
        reputationAfter: e.reputationAfter,
        date: e.createdAt,
      })),
      recentVotes: recentVotes.map(v => ({
        vote: v.vote,
        confidence: v.confidence,
        stakeLevel: v.stakeLevel,
        wasCorrect: v.wasCorrect,
        reputationDelta: v.reputationDelta,
        proposal: v.session.proposal.slice(0, 100),
        domain: v.session.proposalDomain,
        verdict: v.session.verdictAction,
        date: v.session.createdAt,
      })),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

export { router as publicRouter }
