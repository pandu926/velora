import { Router, type Request, type Response, type Router as RouterType } from 'express'
import { privateKeyToAccount } from 'viem/accounts'
import { runBoardroomSession } from '../court/boardroom-engine.js'
import { runBoardroomStreaming, type UserProfile } from '../court/boardroom-stream.js'
import { runConvictionProtocol } from '../court/conviction-protocol.js'
import { runDebateStreaming } from '../court/boardroom-debate.js'
import { DEMO_SCENARIOS } from '../court/demo-scenarios.js'
import { analyzeWalletProfile } from '../services/wallet-profiler.js'
import { A2ACoordinator } from '../services/a2a-coordinator.js'
import { config } from '../config/index.js'

const router: RouterType = Router()
const a2aCoordinator = new A2ACoordinator()

let boardroomStatus: 'idle' | 'debating' = 'idle'

/**
 * GET /api/agents/boardroom/scenarios
 */
router.get('/scenarios', (_req: Request, res: Response) => {
  res.json({ scenarios: DEMO_SCENARIOS })
})

/**
 * GET /api/agents/boardroom/stream
 * SSE endpoint — Adversarial Conviction Protocol (unified flow).
 * Phases: evidence → blind stance → challenge pairs → conviction lock → tally → verdict
 */
router.get('/stream', async (req: Request, res: Response) => {
  if (boardroomStatus !== 'idle') {
    res.status(409).json({ error: 'Boardroom is busy' })
    return
  }

  boardroomStatus = 'debating'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    const scenarioId = req.query['scenario'] as string | undefined
    const customProposal = req.query['proposal'] as string | undefined
    const scenario = scenarioId ? DEMO_SCENARIOS.find(s => s.id === scenarioId) : undefined
    const proposal = scenario?.proposal || customProposal

    const profileParam = req.query['profile'] as string | undefined
    let userProfile: UserProfile | undefined
    if (profileParam) {
      try { userProfile = JSON.parse(decodeURIComponent(profileParam)) } catch {}
    }

    await runConvictionProtocol(res, proposal, userProfile)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
  } finally {
    boardroomStatus = 'idle'
    res.end()
  }
})

/**
 * GET /api/agents/boardroom/stream-legacy
 * Legacy SSE endpoint — simple parallel vote (no conviction protocol).
 */
router.get('/stream-legacy', async (req: Request, res: Response) => {
  if (boardroomStatus !== 'idle') {
    res.status(409).json({ error: 'Boardroom is busy' })
    return
  }

  boardroomStatus = 'debating'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    const scenarioId = req.query['scenario'] as string | undefined
    const customProposal = req.query['proposal'] as string | undefined
    const scenario = scenarioId ? DEMO_SCENARIOS.find(s => s.id === scenarioId) : undefined
    const proposal = scenario?.proposal || customProposal

    const profileParam = req.query['profile'] as string | undefined
    let userProfile: UserProfile | undefined
    if (profileParam) {
      try { userProfile = JSON.parse(decodeURIComponent(profileParam)) } catch {}
    }

    await runBoardroomStreaming(res, proposal, userProfile)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
  } finally {
    boardroomStatus = 'idle'
    res.end()
  }
})

/**
 * GET /api/agents/boardroom/debate
 * SSE endpoint — real A2A debate where agents respond to each other sequentially.
 * Orchestrator moderates, agents challenge/support, proposal can evolve.
 */
router.get('/debate', async (req: Request, res: Response) => {
  if (boardroomStatus !== 'idle') {
    res.status(409).json({ error: 'Boardroom is busy' })
    return
  }

  boardroomStatus = 'debating'

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  try {
    const scenarioId = req.query['scenario'] as string | undefined
    const customProposal = req.query['proposal'] as string | undefined
    const scenario = scenarioId ? DEMO_SCENARIOS.find(s => s.id === scenarioId) : undefined
    const proposal = scenario?.proposal || customProposal

    const profileParam = req.query['profile'] as string | undefined
    let userProfile: UserProfile | undefined
    if (profileParam) {
      try { userProfile = JSON.parse(decodeURIComponent(profileParam)) } catch {}
    }

    await runDebateStreaming(res, proposal, userProfile)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
  } finally {
    boardroomStatus = 'idle'
    res.end()
  }
})

/**
 * POST /api/agents/boardroom
 * Non-streaming session (returns full result at once).
 */
router.post('/', async (req: Request, res: Response) => {
  if (boardroomStatus !== 'idle') {
    res.status(409).json({ error: 'Boardroom is busy' })
    return
  }

  boardroomStatus = 'debating'

  try {
    const body = req.body as { proposal?: string }
    const session = await runBoardroomSession(body.proposal)

    const coordination = session.verdict.approved
      ? await gateBoardroomVerdict(req, session)
      : { gated: false, reason: `No consensus: ${(session.verdict.finalPercentage * 100).toFixed(0)}%` }

    res.json({ session, coordination })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  } finally {
    boardroomStatus = 'idle'
  }
})

/**
 * GET /api/agents/boardroom/profile/:address
 * On-chain wallet analysis → AI-generated risk profile.
 */
router.get('/profile/:address', async (req: Request, res: Response) => {
  const address = req.params['address'] as string
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    res.status(400).json({ error: 'Invalid EVM address' })
    return
  }

  try {
    const profile = await analyzeWalletProfile(address)
    res.json({ profile })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Profile analysis failed'
    res.status(500).json({ error: message })
  }
})

async function gateBoardroomVerdict(
  req: Request,
  session: import('../court/boardroom-types.js').BoardroomSession
): Promise<unknown> {
  const body = req.body as { rootDelegationId?: string; execute?: boolean }
  const verdict = session.verdict

  if (!verdict.approved || verdict.action === 'hold') {
    return { gated: false, reason: 'Not approved or hold' }
  }

  if (typeof body.rootDelegationId !== 'string') {
    return {
      gated: false,
      reason: 'Consensus reached but no rootDelegationId — connect wallet first',
      verdict: { action: verdict.action, percentage: verdict.finalPercentage },
    }
  }

  const tradeAmount = BigInt(
    typeof verdict.params?.amount === 'number'
      ? String(verdict.params.amount * 1_000_000)
      : '10000'
  )
  const destinationUrl = config.webhookBaseUrl
    ? `${config.webhookBaseUrl.replace(/\/$/, '')}/api/webhook/relayer`
    : undefined

  if (body.execute === true && config.privateKey) {
    const commander = privateKeyToAccount(config.privateKey as `0x${string}`)
    const result = await a2aCoordinator.coordinateAndExecute(
      body.rootDelegationId,
      tradeAmount,
      commander.address,
      destinationUrl
    )
    return {
      gated: true,
      executed: true,
      verdict: { action: verdict.action, percentage: verdict.finalPercentage },
      coordination: {
        delegated: result.delegated,
        chain: result.chain,
        traderAddress: result.traderAddress,
        execution: result.execution ?? null,
      },
    }
  }

  const result = await a2aCoordinator.coordinate(
    body.rootDelegationId,
    tradeAmount,
    '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as `0x${string}`
  )

  return {
    gated: true,
    executed: false,
    verdict: { action: verdict.action, percentage: verdict.finalPercentage },
    coordination: {
      delegated: result.delegated,
      chain: result.chain,
      traderAddress: result.traderAddress,
    },
  }
}

export { router as boardroomRouter }
