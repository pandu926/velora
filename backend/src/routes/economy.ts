import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { reputationEngine } from '../economy/reputation-engine.js'
import { caseLawEngine } from '../economy/case-law-engine.js'
import { evolutionEngine } from '../economy/evolution-engine.js'
import { specializationEngine } from '../economy/specialization-engine.js'
import { autoReplacementPipeline } from '../economy/auto-replacement.js'
import { onChainSyncService } from '../services/onchain-sync.js'

const router: RouterType = Router()

/**
 * POST /api/economy/init
 * Initialize agent roster in database (idempotent).
 */
router.post('/init', async (_req: Request, res: Response) => {
  try {
    await reputationEngine.initialize()
    res.json({ success: true, message: 'Agent roster initialized' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Init failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/economy/leaderboard
 * Returns all agents ranked by reputation with weights.
 */
router.get('/leaderboard', async (_req: Request, res: Response) => {
  try {
    const leaderboard = await reputationEngine.getLeaderboard()
    res.json({ agents: leaderboard })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/economy/agent/:agentId/history
 * Returns reputation history for a specific agent.
 */
router.get('/agent/:agentId/history', async (req: Request, res: Response) => {
  const agentId = req.params['agentId'] as string
  const limit = Math.min(parseInt(req.query['limit'] as string) || 20, 100)

  try {
    const history = await reputationEngine.getReputationHistory(agentId, limit)
    res.json({ agentId, history })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/economy/outcome
 * Record outcome for a session (manual or override).
 * Body: { sessionId, result: 'profit'|'loss'|'neutral', valueDelta?, notes? }
 */
router.post('/outcome', async (req: Request, res: Response) => {
  const { sessionId, result, valueDelta, notes } = req.body as {
    sessionId?: string
    result?: string
    valueDelta?: number
    notes?: string
  }

  if (!sessionId || !result) {
    res.status(400).json({ error: 'sessionId and result required' })
    return
  }

  const validResults = new Set(['profit', 'loss', 'neutral'])
  if (!validResults.has(result)) {
    res.status(400).json({ error: 'result must be profit, loss, or neutral' })
    return
  }

  try {
    await reputationEngine.recordOutcome(sessionId, result as 'profit' | 'loss' | 'neutral', valueDelta, notes)
    await caseLawEngine.generateLessonSummary(sessionId)
    res.json({ success: true, message: `Outcome recorded: ${result}` })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/economy/cases
 * Returns relevant case law for a given domain.
 * Query: ?domain=lending&riskLevel=low&limit=5
 */
router.get('/cases', async (req: Request, res: Response) => {
  const domain = (req.query['domain'] as string) || 'lending'
  const riskLevel = req.query['riskLevel'] as string | undefined
  const limit = Math.min(parseInt(req.query['limit'] as string) || 5, 10)

  try {
    const cases = await caseLawEngine.getRelevantCases(domain, riskLevel, 500, limit)
    const count = await caseLawEngine.getCaseCount()
    res.json({ cases, totalCasesWithOutcomes: count })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/economy/weights
 * Returns current voting weights for all agents.
 */
router.get('/weights', async (_req: Request, res: Response) => {
  try {
    const weights = await reputationEngine.getAgentWeights()
    res.json({ weights })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/economy/evolution/status
 * Check if evolution should trigger and get current rankings.
 */
router.get('/evolution/status', async (_req: Request, res: Response) => {
  try {
    const shouldTrigger = await evolutionEngine.shouldTriggerEvolution()
    const ranked = await evolutionEngine.evaluateAgents()
    res.json({ shouldTrigger, agents: ranked })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/economy/evolution/run
 * Trigger an evolution cycle manually.
 */
router.post('/evolution/run', async (_req: Request, res: Response) => {
  try {
    const result = await evolutionEngine.runEvolutionCycle()
    res.json({ success: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/economy/evolution/history
 * Returns evolution event history.
 */
router.get('/evolution/history', async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(req.query['limit'] as string) || 10, 50)
  try {
    const history = await evolutionEngine.getEvolutionHistory(limit)
    res.json({ history })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/economy/specializations/:agentId
 * Returns specialization breakdown for an agent.
 */
router.get('/specializations/:agentId', async (req: Request, res: Response) => {
  const agentId = req.params['agentId'] as string
  try {
    const specializations = await specializationEngine.getAgentSpecializations(agentId)
    res.json({ agentId, specializations })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/economy/auto-check
 * Run the auto-model replacement pipeline: discover → benchmark → replace.
 */
router.post('/auto-check', async (_req: Request, res: Response) => {
  try {
    const result = await autoReplacementPipeline.runAutoCheck()
    res.json({ success: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/economy/models/available
 * Discover new models not currently in the roster.
 */
router.get('/models/available', async (_req: Request, res: Response) => {
  try {
    const models = await autoReplacementPipeline.discoverNewModels()
    res.json({ models, count: models.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/economy/onchain/sync
 * Batch sync agent reputations to on-chain SBT contract.
 */
router.post('/onchain/sync', async (_req: Request, res: Response) => {
  try {
    const result = await onChainSyncService.prepareSync()
    res.json({ success: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/economy/onchain/status
 * Check on-chain sync configuration and last sync time.
 */
router.get('/onchain/status', async (_req: Request, res: Response) => {
  try {
    const configured = onChainSyncService.isConfigured()
    const lastSync = await onChainSyncService.getLastSyncTime()
    res.json({ configured, lastSync, contractAddress: process.env.VELORA_REPUTATION_CONTRACT || null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed'
    res.status(500).json({ error: message })
  }
})

export { router as economyRouter }
