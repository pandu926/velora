import fs from 'node:fs'
import path from 'node:path'
import { type Router as RouterType, Router, type Request, type Response } from 'express'
import { createPublicClient, http, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import type { AgentContext, AgentDecision } from "../agents/types.js"
import { VeniceClient as VeniceClientImpl } from "../services/venice-client.js"
import { VeniceInferenceClient } from "../services/venice-inference-client.js"
import { ScoutAgent } from '../agents/scout.js'
import { SkepticAgent } from '../agents/skeptic.js'
import { CommanderAgent } from '../agents/commander.js'
import { DebateEngine } from '../agents/debate-engine.js'
import { LearningEngine } from '../agents/learning-engine.js'
import { ActivityLog, type ActivityEntry } from '../agents/activity-log.js'
import { AgentRole } from '../types/permissions.js'
import { EvidenceGatherer } from '../court/evidence-gatherer.js'
import { EvidenceCourt } from '../court/evidence-court.js'
import type { CourtCase } from '../court/types.js'
import { A2ACoordinator } from '../services/a2a-coordinator.js'
import { config, getChain } from '../config/index.js'
import { loadSkill, getSkillAsPromptContext } from '../skills/skill-loader.js'
import { SkillEvolver } from '../skills/skill-evolver.js'

const router: RouterType = Router()

// Shared instances (in-memory, single process)
export const activityLog = new ActivityLog()

// SSE clients for real-time activity streaming
const sseClients = new Set<Response>()

/**
 * Broadcasts a new activity entry to all connected SSE clients.
 */
export function broadcastActivity(entry: ActivityEntry): void {
  const data = JSON.stringify(entry)
  for (const client of sseClients) {
    client.write(`data: ${data}\n\n`)
  }
}

// Wire broadcast into activity log so SSE clients get real-time updates
activityLog.onAdd(broadcastActivity)

let agentStatus: 'idle' | 'evaluating' | 'debating' = 'idle'
let lastEvaluation: number | null = null

const veniceClient = new VeniceClientImpl()
const inferenceClient = new VeniceInferenceClient()
const scoutAgent = new ScoutAgent(inferenceClient)
const skepticAgent = new SkepticAgent(inferenceClient, activityLog)
const commanderAgent = new CommanderAgent(veniceClient, activityLog)
const debateEngine = new DebateEngine(inferenceClient, scoutAgent, skepticAgent)
const learningEngine = new LearningEngine(inferenceClient)
const skillEvolver = new SkillEvolver(inferenceClient)
const a2aCoordinator = new A2ACoordinator()

// Evidence Court setup
const chain = getChain()
const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
})
const evidenceGatherer = new EvidenceGatherer(publicClient as unknown as PublicClient)
const evidenceCourt = new EvidenceCourt(inferenceClient, veniceClient, evidenceGatherer)

const COURT_TRANSCRIPTS_DIR = path.resolve(process.cwd(), 'data', 'court-transcripts')

/**
 * Mock context for testing the evaluation pipeline.
 * Uses realistic prices — the court's live market tools will provide
 * actual CoinGecko data that should roughly match these.
 */
function buildMockContext(): AgentContext {
  return {
    portfolio: [
      {
        token: 'USDC',
        address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        balance: '1000000000',
        valueUsd: 1000,
      },
      {
        token: 'WETH',
        address: '0x4200000000000000000000000000000000000006',
        balance: '500000000000000000',
        valueUsd: 850,
      },
    ],
    marketData: {
      prices: {
        USDC: 1.0,
        WETH: 1700.0,
      },
      aaveRates: {
        USDC: { supply: 0.032, borrow: 0.055 },
        WETH: { supply: 0.018, borrow: 0.04 },
      },
      poolLiquidity: {
        'USDC-WETH': 5000000,
      },
    },
    strategy: {
      maxSpendPerTx: '500000000',
      allowedTokens: ['USDC', 'WETH'],
      rebalanceThreshold: 0.05,
      stopLossPercent: 0.1,
    },
  }
}

/**
 * GET /api/agents/status
 * Returns current agent status and last evaluation timestamp.
 */
router.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: agentStatus,
    lastEvaluation,
  })
})

/**
 * GET /api/agents/activity
 * Returns recent activity log entries.
 * Query params:
 *   - limit: number of entries to return (default 50)
 *   - agent: filter by agent role (Commander, Scout, Trader, RiskGuardian)
 */
router.get('/activity', (req: Request, res: Response) => {
  const limit = Math.min(
    Math.max(parseInt(req.query['limit'] as string, 10) || 50, 1),
    200
  )
  const agentFilter = req.query['agent'] as string | undefined

  let entries = activityLog.getRecent(limit)

  if (agentFilter && Object.values(AgentRole).includes(agentFilter as AgentRole)) {
    entries = entries.filter((e) => e.agent === agentFilter)
  }

  res.json({ entries })
})

/**
 * POST /api/agents/evaluate
 * Triggers a full debate + Commander evaluation with mock context.
 * Returns the final decision.
 */
router.post('/evaluate', async (_req: Request, res: Response) => {
  if (agentStatus !== 'idle') {
    res.status(409).json({ error: 'Agent is busy: ' + agentStatus })
    return
  }

  agentStatus = 'evaluating'

  try {
    const context = buildMockContext()

    // Run debate first, then Commander evaluates the result
    const debateResult = await debateEngine.debate(context)
    const decision = await commanderAgent.evaluate(debateResult, context)

    lastEvaluation = Date.now()

    res.json({ decision, debateResult })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  } finally {
    agentStatus = 'idle'
  }
})

/**
 * POST /api/agents/debate
 * Triggers a full adversarial debate between Scout and Skeptic.
 * Commander makes final decision based on debate transcript.
 * Returns the complete DebateResult with all rounds.
 */
router.post('/debate', async (_req: Request, res: Response) => {
  if (agentStatus !== 'idle') {
    res.status(409).json({ error: 'Agent is busy: ' + agentStatus })
    return
  }

  agentStatus = 'debating'

  try {
    const context = buildMockContext()

    // Load lessons from history
    const history = learningEngine.loadHistory()
    const lessons = await learningEngine.analyzeLessons(history)

    // Run the debate
    const debateResult = await debateEngine.debate(context)

    // Commander makes final decision based on debate transcript
    const finalDecision = await commanderAgent.evaluate(debateResult, context)

    // Record the decision for learning
    const portfolioSummary = context.portfolio
      .map((t) => `${t.token}: $${t.valueUsd.toFixed(0)}`)
      .join(', ')

    learningEngine.saveEntry({
      context_summary: portfolioSummary,
      debate_summary: `${debateResult.rounds.length} rounds, converged: ${debateResult.converged}, confidence: ${debateResult.finalConfidence.toFixed(2)}`,
      decision: finalDecision,
    })

    lastEvaluation = Date.now()

    res.json({
      debateResult,
      finalDecision,
      lessons,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  } finally {
    agentStatus = 'idle'
  }
})

/**
 * GET /api/agents/learning/history
 * Returns past decisions from the learning history file.
 */
router.get('/learning/history', (_req: Request, res: Response) => {
  const history = learningEngine.loadHistory()
  res.json({ history })
})

/**
 * POST /api/agents/learning/outcome
 * Record the outcome of a past decision.
 * Body: { entryId: string, outcome: 'profit' | 'neutral' | 'loss' }
 */
router.post('/learning/outcome', (req: Request, res: Response) => {
  const { entryId, outcome } = req.body as {
    entryId?: string
    outcome?: string
  }

  if (!entryId || typeof entryId !== 'string') {
    res.status(400).json({ error: 'Missing or invalid entryId' })
    return
  }

  const validOutcomes = new Set(['profit', 'neutral', 'loss'])
  if (!outcome || !validOutcomes.has(outcome)) {
    res.status(400).json({ error: 'outcome must be profit, neutral, or loss' })
    return
  }

  learningEngine.recordOutcome(entryId, outcome as 'profit' | 'neutral' | 'loss')
  res.json({ success: true })
})

/**
 * POST /api/agents/learning/analyze
 * Triggers Venice AI analysis of past decisions to extract lessons.
 */
router.post('/learning/analyze', async (_req: Request, res: Response) => {
  try {
    const history = learningEngine.loadHistory()
    const lessons = await learningEngine.analyzeLessons(history)
    res.json({ lessons })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/agents/activity/stream
 * Server-Sent Events endpoint for real-time activity updates.
 * Clients connect and receive new activity entries as they occur.
 */
router.get('/activity/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)

  sseClients.add(res)

  req.on('close', () => {
    sseClients.delete(res)
  })
})

/**
 * GET /api/agents/permissions?user=0x...
 * Returns the real delegation hierarchy for a connected user.
 */
router.get('/permissions', (req: Request, res: Response) => {
  const userAddress = req.query.user as string

  if (!userAddress) {
    return res.json({ tree: null })
  }

  const { getActiveDelegations } = require('../services/delegation.js')
  const delegations = getActiveDelegations(userAddress as any)

  if (!delegations || delegations.length === 0) {
    return res.json({ tree: null })
  }

  const root = delegations.find((d: any) => d.parentDelegationId === null)
  if (!root) {
    return res.json({ tree: null })
  }

  const subDelegations = delegations.filter((d: any) => d.parentDelegationId === root.id)

  res.json({
    tree: {
      role: 'user',
      address: userAddress,
      permissions: ['owner', 'kill-switch'],
      children: [{
        role: 'commander',
        address: root.delegate,
        permissions: root.scopes.map((s: any) => s.type),
        children: subDelegations.map((d: any) => ({
          role: d.role.toLowerCase(),
          address: d.delegate,
          permissions: d.scopes.map((s: any) => s.type),
        })),
      }],
    },
  })
})

// ─── Evidence Court Routes ──────────────────────────────────────────────────

/**
 * POST /api/agents/court
 * Triggers a full Evidence Court case — adversarial debate with on-chain evidence.
 * Returns the complete CourtCase with transcript.
 */
router.post('/court', async (req: Request, res: Response) => {
  if (agentStatus !== 'idle') {
    res.status(409).json({ error: 'Agent is busy: ' + agentStatus })
    return
  }

  agentStatus = 'debating'

  try {
    const context = buildMockContext()

    const scoutSkills = 'Market analysis, yield optimization, trend detection, on-chain data interpretation'
    const skepticSkills = 'Risk assessment, evidence verification, counter-argument construction, volatility analysis'
    const judgeSkills = 'Evidence evaluation, logical consistency checking, risk/reward balancing, impartial adjudication'

    const courtCase = await evidenceCourt.runCase(
      context,
      scoutSkills,
      skepticSkills,
      judgeSkills
    )

    // Save transcript to disk
    saveCourtCase(courtCase)

    lastEvaluation = Date.now()

    // ─── Court Verdict as Delegation Gate ─────────────────────────────────
    // When the AI court returns an actionable verdict with strong evidence,
    // the verdict authorizes on-chain action: Commander redelegates a narrowed,
    // time-boxed scope to the Trader specialist (A2A). The court transcript is
    // the on-chain justification for the delegation.
    const coordination = await maybeGateDelegation(req, courtCase)

    res.json({ courtCase, coordination })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  } finally {
    agentStatus = 'idle'
  }
})

/** Actions that require on-chain execution (and therefore a Trader delegation). */
const EXECUTABLE_ACTIONS = new Set(['swap', 'supply', 'withdraw', 'rebalance'])

/** Minimum evidence score (0-100) the court must reach to authorize a delegation. */
const DELEGATION_EVIDENCE_THRESHOLD = 65

/** Aerodrome router on Base — default execution target for a swap. */
const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43'

/**
 * If the court verdict is actionable and well-evidenced, trigger A2A
 * redelegation from Commander to Trader. Returns null when the gate is closed
 * (hold, weak evidence, or no root delegation supplied).
 */
async function maybeGateDelegation(
  req: Request,
  courtCase: CourtCase
): Promise<unknown> {
  const verdict = courtCase.verdict
  const body = req.body as {
    rootDelegationId?: unknown
    tradeAmount?: unknown
    execute?: unknown
  }

  if (!EXECUTABLE_ACTIONS.has(verdict.action)) {
    return { gated: false, reason: `Verdict action "${verdict.action}" requires no execution` }
  }

  if (verdict.evidenceScore < DELEGATION_EVIDENCE_THRESHOLD) {
    return {
      gated: false,
      reason: `Evidence score ${verdict.evidenceScore} below threshold ${DELEGATION_EVIDENCE_THRESHOLD} — delegation withheld`,
    }
  }

  if (typeof body.rootDelegationId !== 'string') {
    return {
      gated: false,
      reason: 'Verdict is actionable but no rootDelegationId supplied — connect wallet and grant permissions first',
      verdict: { action: verdict.action, evidenceScore: verdict.evidenceScore },
    }
  }

  // Safety: on-chain settlement is opt-in (execute:true). Default settles a
  // small amount to the Commander itself (net-zero) so demos don't drain funds.
  const amountParam = verdict.params?.['amountIn'] ?? body.tradeAmount
  const tradeAmount = BigInt(typeof amountParam === 'string' ? amountParam : '10000') // 0.01 USDC default
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
      verdict: { action: verdict.action, evidenceScore: verdict.evidenceScore },
      coordination: {
        delegated: result.delegated,
        chain: result.chain,
        traderAddress: result.traderAddress,
        fallbackMode: result.fallbackMode,
        reason: result.reason,
        subDelegationId: result.subDelegation?.id ?? null,
        execution: result.execution ?? null,
      },
    }
  }

  const result = await a2aCoordinator.coordinate(
    body.rootDelegationId,
    tradeAmount,
    AERODROME_ROUTER as `0x${string}`
  )

  return {
    gated: true,
    executed: false,
    verdict: { action: verdict.action, evidenceScore: verdict.evidenceScore },
    coordination: {
      delegated: result.delegated,
      chain: result.chain,
      traderAddress: result.traderAddress,
      fallbackMode: result.fallbackMode,
      reason: result.reason,
      subDelegationId: result.subDelegation?.id ?? null,
    },
  }
}

/**
 * GET /api/agents/court/history
 * Returns recent court cases from transcript files.
 * Query params:
 *   - limit: number of cases to return (default 20)
 */
router.get('/court/history', (req: Request, res: Response) => {
  const limit = Math.min(
    Math.max(parseInt(req.query['limit'] as string, 10) || 20, 1),
    100
  )

  try {
    const cases = loadCourtHistory(limit)
    res.json({ cases })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

/**
 * Saves a CourtCase to the transcripts directory.
 */
function saveCourtCase(courtCase: CourtCase): void {
  if (!fs.existsSync(COURT_TRANSCRIPTS_DIR)) {
    fs.mkdirSync(COURT_TRANSCRIPTS_DIR, { recursive: true })
  }

  const filePath = path.join(COURT_TRANSCRIPTS_DIR, `${courtCase.id}.json`)
  fs.writeFileSync(filePath, JSON.stringify(courtCase, null, 2), 'utf-8')
}

/**
 * Loads recent court cases from the transcripts directory.
 */
function loadCourtHistory(limit: number): CourtCase[] {
  if (!fs.existsSync(COURT_TRANSCRIPTS_DIR)) {
    return []
  }

  const files = fs.readdirSync(COURT_TRANSCRIPTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit)

  const cases: CourtCase[] = []

  for (const file of files) {
    try {
      const content = fs.readFileSync(
        path.join(COURT_TRANSCRIPTS_DIR, file),
        'utf-8'
      )
      cases.push(JSON.parse(content) as CourtCase)
    } catch {
      // Skip malformed files
    }
  }

  // Sort by timestamp descending
  cases.sort((a, b) => b.timestamp - a.timestamp)

  return cases
}

// ─── Self-Evolving Skills Routes ─────────────────────────────────────────────

const VALID_SKILL_ROLES = ['scout', 'skeptic', 'judge', 'commander']

/**
 * GET /api/agents/skills
 * Returns all agent skills (parsed).
 */
router.get('/skills', (_req: Request, res: Response) => {
  try {
    const skills = VALID_SKILL_ROLES.map((role) => {
      try {
        return loadSkill(role)
      } catch {
        return null
      }
    }).filter((s) => s !== null)

    res.json({ skills })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

/**
 * GET /api/agents/skills/:role
 * Returns a specific agent's skill.
 */
router.get('/skills/:role', (req: Request, res: Response) => {
  const role = req.params['role'] as string

  if (!VALID_SKILL_ROLES.includes(role)) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_SKILL_ROLES.join(', ')}` })
    return
  }

  try {
    const skill = loadSkill(role)
    const promptContext = getSkillAsPromptContext(role)
    res.json({ skill, promptContext })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(404).json({ error: message })
  }
})

/**
 * GET /api/agents/skills/:role/history
 * Returns skill evolution history for a role.
 */
router.get('/skills/:role/history', (req: Request, res: Response) => {
  const role = req.params['role'] as string

  if (!VALID_SKILL_ROLES.includes(role)) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_SKILL_ROLES.join(', ')}` })
    return
  }

  try {
    const history = skillEvolver.getHistory(role)
    res.json(history)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

/**
 * POST /api/agents/skills/:role/evolve
 * Manually trigger skill evolution (for testing).
 * Body: { outcome: 'profit' | 'neutral' | 'loss', details: string, courtCase?: object }
 */
router.post('/skills/:role/evolve', async (req: Request, res: Response) => {
  const role = req.params['role'] as string

  if (!VALID_SKILL_ROLES.includes(role)) {
    res.status(400).json({ error: `Invalid role. Must be one of: ${VALID_SKILL_ROLES.join(', ')}` })
    return
  }

  const { outcome, details, courtCase } = req.body as {
    outcome?: string
    details?: string
    courtCase?: unknown
  }

  const validOutcomes = new Set(['profit', 'neutral', 'loss'])
  if (!outcome || !validOutcomes.has(outcome)) {
    res.status(400).json({ error: 'outcome must be profit, neutral, or loss' })
    return
  }

  if (!details || typeof details !== 'string') {
    res.status(400).json({ error: 'details is required and must be a string' })
    return
  }

  try {
    const evolution = await skillEvolver.evolve(
      role,
      courtCase ?? 'No court case provided — manual evolution trigger',
      outcome as 'profit' | 'neutral' | 'loss',
      details
    )
    res.json({ evolution })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: message })
  }
})

export const agentsRouter: RouterType = router
