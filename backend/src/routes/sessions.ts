import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { prisma } from '../db/client.js'

const router: RouterType = Router()

/**
 * GET /api/sessions
 * Paginated session list with filters.
 * Query: ?page=1&limit=20&filter=all|approved|rejected&type=whale_alert|buy_dip|...
 */
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query['page'] as string) || 1)
  const limit = Math.min(50, parseInt(req.query['limit'] as string) || 20)
  const filter = (req.query['filter'] as string) || 'all'
  const type = req.query['type'] as string | undefined
  const user = req.query['user'] as string | undefined

  const where: Record<string, unknown> = {}
  if (filter === 'approved') where.consensusReached = true
  if (filter === 'rejected') where.consensusReached = false
  if (type) where.trigger = { contains: type }
  if (user) where.userAddress = user.toLowerCase()

  try {
    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          proposal: true,
          proposalDomain: true,
          mode: true,
          trigger: true,
          consensusReached: true,
          finalPercentage: true,
          weightedPercentage: true,
          verdictAction: true,
          orchestratorSummary: true,
          executionResult: true,
          createdAt: true,
          votes: { select: { agentId: true, vote: true, confidence: true, stakeLevel: true } },
        },
      }),
      prisma.session.count({ where }),
    ])

    const items = sessions.map(s => ({
      id: s.id,
      proposal: s.proposal.slice(0, 150),
      domain: s.proposalDomain,
      mode: s.mode,
      trigger: s.trigger,
      approved: s.consensusReached,
      percentage: s.finalPercentage,
      weightedPercentage: s.weightedPercentage,
      action: s.verdictAction,
      summary: s.orchestratorSummary?.slice(0, 200),
      executed: !!(s.executionResult as Record<string, unknown>)?.executed,
      txHash: (s.executionResult as Record<string, unknown>)?.txHash as string | null ?? null,
      yesCount: s.votes.filter(v => v.vote === 'yes').length,
      noCount: s.votes.filter(v => v.vote === 'no').length,
      stakedCount: s.votes.filter(v => v.stakeLevel !== 'none').length,
      date: s.createdAt,
    }))

    res.json({ sessions: items, total, page, limit, pages: Math.ceil(total / limit) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/sessions/:id
 * Full session detail — complete audit trail, nothing hidden.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = req.params['id'] as string

  try {
    const session = await prisma.session.findUnique({
      where: { id },
      include: {
        votes: {
          include: { agent: { select: { role: true, model: true, reputation: true } } },
        },
        outcome: true,
        caseLaw: true,
      },
    })

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    res.json({
      id: session.id,
      proposal: session.proposal,
      domain: session.proposalDomain,
      mode: session.mode,
      trigger: session.trigger,
      triggerData: session.triggerData,
      approved: session.consensusReached,
      percentage: session.finalPercentage,
      weightedPercentage: session.weightedPercentage,
      action: session.verdictAction,
      orchestratorSummary: session.orchestratorSummary,
      totalRounds: session.totalRounds,
      date: session.createdAt,

      // Full agent stances
      stances: session.votes.map(v => ({
        agentId: v.agentId,
        role: v.agent.role,
        model: v.agent.model,
        reputation: v.agent.reputation,
        vote: v.vote,
        confidence: v.confidence,
        reasoning: v.reasoning,
        stakeLevel: v.stakeLevel,
        stakedAmount: v.stakedAmount,
        wasCorrect: v.wasCorrect,
        reputationDelta: v.reputationDelta,
        data: v.dataPayload,
        compositeRisk: v.compositeRisk,
      })),

      // Full challenge exchanges
      challenges: session.challengeLog ?? [],

      // Full conviction locks
      convictions: session.convictionLog ?? [],

      // Chat timeline (WhatsApp-style replay)
      chatMessages: (session.convictionLog as Record<string, unknown>)?.chatMessages ?? null,

      // Execution result
      execution: session.executionResult,

      // Outcome (if measured)
      outcome: session.outcome ? {
        result: session.outcome.result,
        valueDelta: session.outcome.valueDelta,
        measuredAt: session.outcome.measuredAt,
        method: session.outcome.measureMethod,
        notes: session.outcome.notes,
      } : null,

      // Case law entry
      caseLaw: session.caseLaw ? {
        domain: session.caseLaw.domain,
        riskLevel: session.caseLaw.riskLevel,
        lessonSummary: session.caseLaw.lessonSummary,
        outcome: session.caseLaw.outcome,
      } : null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

export { router as sessionsRouter }
