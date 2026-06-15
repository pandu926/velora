import { EventEmitter } from 'node:events'
import { strategyPlanner, type StrategyPlan, type StrategyTarget } from './planner.js'
import { MoneyManager } from './money-manager.js'
import { opportunityScanner, type Opportunity } from './opportunity-scanner.js'
import { executionRouter } from './execution-router.js'
import { runConvictionProtocol } from '../court/conviction-protocol.js'
import { prisma } from '../db/client.js'
import type { BoardroomSession } from '../court/boardroom-types.js'
import type { Address, Hex } from 'viem'
import { A2ACoordinator } from '../services/a2a-coordinator.js'
import { executeDirectViaRelayer, type WorkExecution } from '../services/relayer-executor.js'
import { getDelegation } from '../services/delegation.js'
import { config } from '../config/index.js'

const a2aCoordinator = new A2ACoordinator()

export interface AutonomousConfig {
  targetValue: number
  currentValue: number
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
  timeframe: string
  userAddress: Address
  delegationId?: string
  autoExecute: boolean
}

export interface AutonomousState {
  status: 'idle' | 'planning' | 'scanning' | 'deliberating' | 'executing' | 'stopped'
  plan: StrategyPlan | null
  config: AutonomousConfig | null
  portfolio: ReturnType<MoneyManager['getState']> | null
  pendingOpportunity: Opportunity | null
  history: AutonomousAction[]
  startedAt: number | null
}

export interface AutonomousAction {
  id: string
  opportunity: Opportunity
  verdict: { approved: boolean; action: string; percentage: number; summary: string }
  executed: boolean
  txHash?: string
  timestamp: number
}

type AutonomousEvent =
  | { type: 'status_change'; status: AutonomousState['status'] }
  | { type: 'plan_generated'; plan: StrategyPlan }
  | { type: 'opportunity_detected'; opportunity: Opportunity }
  | { type: 'deliberation_start'; proposal: string }
  | { type: 'deliberation_complete'; verdict: AutonomousAction['verdict'] }
  | { type: 'execution_complete'; txHash?: string; action: string }
  | { type: 'alert'; message: string }
  | { type: 'conviction_event'; detail: unknown }

class ConvictionForwarder {
  constructor(private readonly emitter: AutonomousLoop) {}
  write(chunk: string): boolean {
    const match = chunk.match(/^data: (.+)\n\n$/s)
    if (match) {
      try {
        const event = JSON.parse(match[1])
        this.emitter.emitEvent({ type: 'conviction_event', detail: event })
      } catch { /* non-JSON SSE frame, skip */ }
    }
    return true
  }
  end(): void {}
  setHeader(_name: string, _value: string): void {}
  get headersSent(): boolean { return false }
}

export class AutonomousLoop extends EventEmitter {
  private state: AutonomousState = {
    status: 'idle',
    plan: null,
    config: null,
    portfolio: null,
    pendingOpportunity: null,
    history: [],
    startedAt: null,
  }

  private moneyManager: MoneyManager | null = null
  private processing = false

  async start(config: AutonomousConfig): Promise<StrategyPlan> {
    this.setStatus('planning')
    this.state.config = config
    this.state.history = []
    this.state.startedAt = Date.now()

    const target: StrategyTarget = {
      targetValue: config.targetValue,
      currentValue: config.currentValue,
      riskLevel: config.riskLevel,
      timeframe: config.timeframe,
    }

    const plan = await strategyPlanner.generatePlan(target)
    this.state.plan = plan

    this.moneyManager = new MoneyManager(config.currentValue, config.targetValue, plan.rules)
    this.state.portfolio = this.moneyManager.getState()

    opportunityScanner.configure(plan, this.moneyManager)
    opportunityScanner.on('opportunity', this.handleOpportunity)
    opportunityScanner.on('alert', this.handleAlert)
    opportunityScanner.start()

    this.setStatus('scanning')
    this.emitEvent({ type: 'plan_generated', plan })
    this.emitEvent({ type: 'alert', message: `Strategy: ${plan.allocations.map(a => `${a.percentage}% ${a.type} via ${a.protocol}`).join(', ')}` })

    // Trigger initial allocation — put plan to vote immediately
    this.triggerInitialAllocation(plan, config)

    return plan
  }

  private triggerInitialAllocation(plan: StrategyPlan, config: AutonomousConfig): void {
    const primaryAllocation = plan.allocations[0]
    if (!primaryAllocation || primaryAllocation.type === 'reserve') return

    const amount = Math.floor(config.currentValue * (primaryAllocation.percentage / 100) * 1_000_000) / 1_000_000

    const opportunity: Opportunity = {
      id: crypto.randomUUID(),
      type: 'initial_allocation',
      trigger: `Plan: ${primaryAllocation.percentage}% to ${primaryAllocation.protocol} ${primaryAllocation.type}`,
      proposal: `Initial allocation: ${primaryAllocation.type} ${amount} USDC via ${primaryAllocation.protocol}. AI strategy recommends ${primaryAllocation.rationale ?? `${primaryAllocation.percentage}% allocation`}.`,
      priority: 'normal',
      timestamp: Date.now(),
      marketData: {},
      intent: {
        action: primaryAllocation.type === 'lending' ? 'supply' : 'swap',
        token: primaryAllocation.token || 'USDC',
        amount,
        protocol: primaryAllocation.protocol || 'aave',
      },
    }

    // Delay slightly to let SSE connection establish
    setTimeout(() => {
      this.handleOpportunity(opportunity)
    }, 3000)
  }

  stop(): void {
    opportunityScanner.stop()
    opportunityScanner.off('opportunity', this.handleOpportunity)
    opportunityScanner.off('alert', this.handleAlert)
    this.setStatus('stopped')
  }

  getState(): AutonomousState {
    if (this.moneyManager) {
      this.state.portfolio = this.moneyManager.getState()
    }
    return { ...this.state }
  }

  getHistory(): AutonomousAction[] {
    return [...this.state.history]
  }

  private handleOpportunity = async (opportunity: Opportunity): Promise<void> => {
    if (this.processing) return
    this.processing = true
    this.state.pendingOpportunity = opportunity

    try {
      this.emitEvent({ type: 'opportunity_detected', opportunity })
      this.setStatus('deliberating')

      opportunityScanner.setBoardroomBusy(true)
      this.emitEvent({ type: 'deliberation_start', proposal: opportunity.proposal })

      const session = await this.runHeadlessDeliberation(opportunity)
      // Lower threshold for initial_allocation (AI's own plan) vs market-triggered
      const threshold = opportunity.type === 'initial_allocation' ? 0.60 : 0.70
      const isApproved = session.verdict.finalPercentage >= threshold
      const verdict = {
        approved: isApproved,
        action: session.verdict.action,
        percentage: session.verdict.finalPercentage,
        summary: session.verdict.orchestratorSummary,
      }

      this.emitEvent({ type: 'deliberation_complete', verdict })

      const action: AutonomousAction = {
        id: crypto.randomUUID(),
        opportunity,
        verdict,
        executed: false,
        timestamp: Date.now(),
      }

      if (verdict.approved && verdict.action !== 'hold') {
        if (this.state.config?.autoExecute && this.state.config?.delegationId) {
          this.setStatus('executing')
          const txResult = await this.executeAction(opportunity, session)
          action.executed = txResult.success
          action.txHash = txResult.txHash

          // Persist execution result to session
          try {
            await prisma.session.update({
              where: { id: session.id },
              data: { executionResult: { executed: txResult.success, txHash: txResult.txHash, timestamp: Date.now() } },
            })
          } catch {}

          if (txResult.success) {
            this.moneyManager?.trackExecution(opportunity.intent, true, txResult.txHash)
            // Schedule outcome measurement after 1 hour
            this.scheduleOutcomeMeasurement(session.id, opportunity)
          }
        } else {
          this.emitEvent({ type: 'alert', message: `Approved but auto-execute disabled or no delegation. Action: ${verdict.action}` })
        }
      }

      this.state.history.push(action)
      if (this.state.history.length > 100) this.state.history.shift()
    } catch (error) {
      this.emitEvent({ type: 'alert', message: `Deliberation error: ${error instanceof Error ? error.message : 'unknown'}` })
    } finally {
      this.processing = false
      this.state.pendingOpportunity = null
      opportunityScanner.setBoardroomBusy(false)
      if (this.state.status !== 'stopped') this.setStatus('scanning')
    }
  }

  private handleAlert = (alert: { type: string; message: string }): void => {
    this.emitEvent({ type: 'alert', message: alert.message })
  }

  private async runHeadlessDeliberation(opportunity: Opportunity): Promise<BoardroomSession> {
    const syntheticRes = new ConvictionForwarder(this) as unknown as import('express').Response
    const proposal = `[AUTO:${opportunity.type}] ${opportunity.proposal}`
    return runConvictionProtocol(syntheticRes, proposal, undefined, this.state.config?.userAddress)
  }

  private async executeAction(opportunity: Opportunity, _session: BoardroomSession): Promise<{ success: boolean; txHash?: string }> {
    if (!this.state.config) return { success: false }

    try {
      const workExecutions = await executionRouter.routeExecution(
        opportunity.intent.action,
        { token: opportunity.intent.token, amount: opportunity.intent.amount, protocol: opportunity.intent.protocol },
        this.state.config.userAddress
      )

      if (workExecutions.length === 0) {
        this.emitEvent({ type: 'alert', message: 'No execution steps generated for this action' })
        return { success: false }
      }

      const webhookUrl = config.webhookBaseUrl
        ? `${config.webhookBaseUrl}/api/webhook/relayer`
        : undefined

      // Try direct 1Shot path (user's permissionContext from ERC-7715)
      const root = getDelegation(this.state.config.delegationId!)
      console.log('[Execution] delegationId:', this.state.config.delegationId, 'hasPermCtx:', !!root?.permissionContext)

      if (root?.permissionContext) {
        this.emitEvent({ type: 'alert', message: 'Executing via 1Shot (user smart account)...' })

        const buildWork = (_usdc: `0x${string}`): WorkExecution[] =>
          workExecutions.map(w => ({ target: w.target, value: w.value.toString(), data: w.data }))

        const outcome = await executeDirectViaRelayer(
          root.permissionContext,
          buildWork,
          webhookUrl,
          root.delegationManager
        )
        console.log('[Execution] 1Shot outcome:', JSON.stringify(outcome).slice(0, 300))

        if (outcome.status === 'confirmed') {
          this.emitEvent({ type: 'execution_complete', txHash: outcome.txHash, action: opportunity.intent.action })
          return { success: true, txHash: outcome.txHash }
        }

        this.emitEvent({ type: 'alert', message: `Relayer ${outcome.status}: tx not confirmed` })
        return { success: false }
      }

      // Fallback: legacy A2A coordinator path (agent-funded)
      const result = await a2aCoordinator.coordinateAndExecuteWork(
        this.state.config.delegationId!,
        workExecutions,
        this.state.config.userAddress as `0x${string}`,
        webhookUrl
      )

      if (result.execution?.status === 'confirmed') {
        this.emitEvent({ type: 'execution_complete', txHash: result.execution.txHash, action: opportunity.intent.action })
        return { success: true, txHash: result.execution.txHash }
      }

      if (result.reason) {
        this.emitEvent({ type: 'alert', message: result.reason })
      }

      return { success: false }
    } catch (error) {
      console.log('[Execution] CAUGHT ERROR:', error instanceof Error ? error.message : error)
      this.emitEvent({ type: 'alert', message: `Execution failed: ${error instanceof Error ? error.message : 'unknown'}` })
      return { success: false }
    }
  }

  private scheduleOutcomeMeasurement(sessionId: string, opportunity: Opportunity): void {
    const measureDelay = 3600_000 // 1 hour
    setTimeout(async () => {
      try {
        const { reputationEngine } = await import('../economy/reputation-engine.js')
        const { realtimeFeeds } = await import('../services/realtime-feeds.js')

        const prices = realtimeFeeds.getLatestPrices()
        const ethPrice = prices.get('ETHUSDT')
        const currentPrice = ethPrice?.price ?? 0
        const entryPrice = opportunity.intent.amount ?? 0

        let result: 'profit' | 'loss' | 'neutral' = 'neutral'
        let valueDelta = 0

        if (opportunity.intent.action === 'supply' || opportunity.intent.action === 'swap') {
          valueDelta = currentPrice > 0 && entryPrice > 0
            ? ((currentPrice - entryPrice) / entryPrice) * 100
            : 0
          result = valueDelta > 1 ? 'profit' : valueDelta < -1 ? 'loss' : 'neutral'
        }

        await reputationEngine.recordOutcome(sessionId, result, valueDelta)
      } catch {
        // Measurement failed — will be retried on next startup
      }
    }, measureDelay)
  }

  private setStatus(status: AutonomousState['status']): void {
    this.state.status = status
    this.emitEvent({ type: 'status_change', status })
  }

  emitEvent(event: AutonomousEvent): void {
    this.emit('event', event)

    const persistTypes = ['opportunity_detected', 'deliberation_complete', 'execution_complete', 'alert']
    if (persistTypes.includes(event.type) && this.state.config?.userAddress) {
      const userAddress = this.state.config.userAddress.toLowerCase()
      prisma.userProfile.findUnique({ where: { walletAddress: userAddress } }).then(profile => {
        if (!profile) return
        const message = this.summarizeEvent(event)
        prisma.activityLog.create({
          data: {
            userId: profile.id,
            type: event.type,
            message,
            data: event as any,
            txHash: event.type === 'execution_complete' ? (event as any).txHash : undefined,
          },
        }).catch(() => {})
      }).catch(() => {})
    }
  }

  private summarizeEvent(event: AutonomousEvent): string {
    switch (event.type) {
      case 'opportunity_detected':
        return `Opportunity: ${(event as any).opportunity?.type ?? 'unknown'}`
      case 'deliberation_complete':
        return `Verdict: ${(event as any).verdict?.approved ? 'APPROVED' : 'REJECTED'} — ${(event as any).verdict?.action ?? ''}`
      case 'execution_complete':
        return `Executed ${(event as any).action ?? 'action'} — tx: ${(event as any).txHash ?? 'pending'}`
      case 'alert':
        return (event as any).message ?? 'Alert'
      default:
        return event.type
    }
  }
}

export const autonomousLoop = new AutonomousLoop()
