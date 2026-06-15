import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { type AutonomousConfig } from '../strategy/autonomous-loop.js'
import { loopManager } from '../services/loop-manager.js'
import { prisma } from '../db/client.js'
import type { Address } from 'viem'

const router: RouterType = Router()

function getUserAddress(req: Request): string | null {
  return (req.query.user as string) || (req.body?.userAddress as string) || null
}

/**
 * POST /api/autonomous/start
 * Start autonomous strategy loop for a specific user.
 */
router.post('/start', async (req: Request, res: Response) => {
  const body = req.body as Partial<AutonomousConfig>

  if (!body.targetValue || !body.currentValue || !body.riskLevel) {
    res.status(400).json({ error: 'targetValue, currentValue, and riskLevel required' })
    return
  }

  const userAddress = (body.userAddress || '0x0000000000000000000000000000000000000000') as Address

  const config: AutonomousConfig = {
    targetValue: body.targetValue,
    currentValue: body.currentValue,
    riskLevel: body.riskLevel,
    timeframe: body.timeframe || '6m',
    userAddress,
    delegationId: body.delegationId,
    autoExecute: body.autoExecute ?? false,
  }

  try {
    const loop = loopManager.getOrCreate(userAddress)
    const plan = await loop.start(config)

    // Persist strategy to DB
    const profile = await prisma.userProfile.upsert({
      where: { walletAddress: userAddress.toLowerCase() },
      create: { walletAddress: userAddress.toLowerCase() },
      update: {},
    })

    await prisma.userStrategy.create({
      data: {
        userId: profile.id,
        targetValue: config.targetValue,
        currentValue: config.currentValue,
        riskLevel: config.riskLevel,
        timeframe: config.timeframe,
        delegationId: config.delegationId ?? null,
        plan: plan as any,
        status: 'running',
        autoExecute: config.autoExecute,
        startedAt: new Date(),
      },
    })

    res.json({ success: true, plan, status: loop.getState().status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to start'
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/autonomous/stop
 * Stop the autonomous loop for a specific user.
 */
router.post('/stop', async (req: Request, res: Response) => {
  const userAddress = getUserAddress(req)
  if (!userAddress) {
    res.status(400).json({ error: 'userAddress required' })
    return
  }

  const loop = loopManager.get(userAddress)
  if (loop) {
    loop.stop()
  }

  // Update strategy status in DB
  const profile = await prisma.userProfile.findUnique({ where: { walletAddress: userAddress.toLowerCase() } })
  if (profile) {
    await prisma.userStrategy.updateMany({
      where: { userId: profile.id, status: 'running' },
      data: { status: 'stopped', stoppedAt: new Date() },
    })
  }

  res.json({ success: true, status: 'stopped' })
})

/**
 * GET /api/autonomous/status?user=0x...
 * Current state for a specific user.
 */
router.get('/status', (req: Request, res: Response) => {
  const userAddress = getUserAddress(req)
  if (!userAddress) {
    res.json({ status: 'idle', plan: null, config: null, portfolio: null, pendingOpportunity: null, history: [], startedAt: null })
    return
  }

  const loop = loopManager.get(userAddress)
  if (!loop) {
    res.json({ status: 'idle', plan: null, config: null, portfolio: null, pendingOpportunity: null, history: [], startedAt: null })
    return
  }

  res.json(loop.getState())
})

/**
 * GET /api/autonomous/history?user=0x...
 * Past autonomous actions from DB.
 */
router.get('/history', async (req: Request, res: Response) => {
  const userAddress = getUserAddress(req)
  if (!userAddress) {
    res.json({ actions: [] })
    return
  }

  const profile = await prisma.userProfile.findUnique({ where: { walletAddress: userAddress.toLowerCase() } })
  if (!profile) {
    res.json({ actions: [] })
    return
  }

  const activities = await prisma.activityLog.findMany({
    where: { userId: profile.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })

  res.json({ actions: activities })
})

/**
 * GET /api/autonomous/stream?user=0x...
 * SSE stream of autonomous decisions for a specific user.
 */
router.get('/stream', (req: Request, res: Response) => {
  const userAddress = getUserAddress(req)

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  if (!userAddress) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'user query param required' })}\n\n`)
    return
  }

  const loop = loopManager.getOrCreate(userAddress)

  const onEvent = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  loop.on('event', onEvent)
  res.write(`data: ${JSON.stringify({ type: 'connected', state: loop.getState() })}\n\n`)

  req.on('close', () => {
    loop.off('event', onEvent)
  })
})

export { router as autonomousRouter }
