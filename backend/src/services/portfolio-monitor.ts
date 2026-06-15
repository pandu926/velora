import type { Address } from 'viem'
import type { ActivityLog } from '../agents/activity-log.js'
import type { RebalancerEngine } from '../agents/rebalancer.js'
import type { AgentContext } from '../agents/types.js'
import { AgentRole } from '../types/permissions.js'
import type { StopLossMonitor } from './stop-loss-monitor.js'

/**
 * Periodic portfolio monitor that orchestrates stop-loss checks
 * and rebalance drift detection on a configurable interval.
 *
 * Lifecycle: startMonitoring() → runs until stopMonitoring() is called.
 */
export class PortfolioMonitor {
  private readonly rebalancer: RebalancerEngine
  private readonly stopLossMonitor: StopLossMonitor
  private readonly activityLog: ActivityLog
  private intervalId: ReturnType<typeof setInterval> | null = null
  private isRunning = false
  private lastCheckTimestamp: number = 0
  private checksCount: number = 0

  constructor(
    rebalancer: RebalancerEngine,
    stopLossMonitor: StopLossMonitor,
    activityLog: ActivityLog
  ) {
    this.rebalancer = rebalancer
    this.stopLossMonitor = stopLossMonitor
    this.activityLog = activityLog
  }

  /**
   * Starts periodic monitoring. Each tick:
   * 1. Checks stop-loss condition
   * 2. If not triggered, checks rebalance drift
   * 3. Logs monitoring activity
   */
  startMonitoring(
    context: AgentContext,
    delegation: unknown,
    userAddress: Address,
    initialPortfolioValue: number,
    intervalMs: number
  ): void {
    if (this.intervalId !== null) {
      return // Already monitoring
    }

    this.isRunning = true

    this.activityLog.add({
      agent: AgentRole.Commander,
      action: 'monitoring-started',
      reasoning: `Portfolio monitoring started with ${intervalMs}ms interval. Initial value: $${initialPortfolioValue.toFixed(2)}`,
      decision: {
        action: 'hold',
        reasoning: 'Monitoring loop initiated',
        confidence: 1,
        params: { intervalMs, initialPortfolioValue },
      },
    })

    this.intervalId = setInterval(() => {
      void this.tick(context, delegation, userAddress, initialPortfolioValue)
    }, intervalMs)
  }

  /**
   * Stops the monitoring loop and clears the interval.
   */
  stopMonitoring(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    if (this.isRunning) {
      this.isRunning = false

      this.activityLog.add({
        agent: AgentRole.Commander,
        action: 'monitoring-stopped',
        reasoning: 'Portfolio monitoring stopped',
        decision: {
          action: 'hold',
          reasoning: 'Monitoring loop terminated',
          confidence: 1,
        },
      })
    }
  }

  /**
   * Returns whether the monitor is currently active.
   */
  getIsRunning(): boolean {
    return this.isRunning
  }

  /**
   * Returns the current monitor status including run state and metrics.
   */
  getStatus(): { running: boolean; lastCheck: number; checksCount: number } {
    return {
      running: this.isRunning,
      lastCheck: this.lastCheckTimestamp,
      checksCount: this.checksCount,
    }
  }

  /**
   * Single monitoring tick — checks stop-loss then drift.
   */
  private async tick(
    context: AgentContext,
    delegation: unknown,
    userAddress: Address,
    initialPortfolioValue: number
  ): Promise<void> {
    this.lastCheckTimestamp = Date.now()
    this.checksCount++

    try {
      // 1. Check stop-loss
      const stopLossResult = this.stopLossMonitor.checkPortfolioValue(
        context.portfolio,
        initialPortfolioValue,
        context.strategy
      )

      if (stopLossResult.triggered) {
        await this.stopLossMonitor.triggerStopLoss(
          userAddress,
          stopLossResult.dropPercent,
          stopLossResult.currentValue
        )
        this.stopMonitoring()
        return
      }

      // 2. Check rebalance drift
      const driftCheck = this.rebalancer.checkDrift(
        context.portfolio,
        context.strategy
      )

      if (driftCheck.needsRebalance) {
        this.activityLog.add({
          agent: AgentRole.Commander,
          action: 'drift-detected',
          reasoning: `Portfolio drift detected. Triggering rebalance evaluation.`,
          decision: {
            action: 'rebalance',
            reasoning: 'Drift exceeds threshold',
            confidence: 0.9,
            params: { drifts: driftCheck.drifts },
          },
        })

        await this.rebalancer.rebalance(context, delegation as `0x${string}`, userAddress)
      }

      // 3. Log heartbeat
      this.activityLog.add({
        agent: AgentRole.RiskGuardian,
        action: 'monitor-tick',
        reasoning: `Portfolio check complete. Value: $${stopLossResult.currentValue.toFixed(2)}, Drop: ${(stopLossResult.dropPercent * 100).toFixed(2)}%, Drift rebalance needed: ${driftCheck.needsRebalance}`,
        decision: {
          action: 'hold',
          reasoning: 'Periodic health check — no action required',
          confidence: 1,
          params: {
            currentValue: stopLossResult.currentValue,
            dropPercent: stopLossResult.dropPercent,
            needsRebalance: driftCheck.needsRebalance,
          },
        },
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      this.activityLog.add({
        agent: AgentRole.RiskGuardian,
        action: 'monitor-error',
        reasoning: `Monitoring tick failed: ${message}`,
        decision: {
          action: 'hold',
          reasoning: 'Error during monitoring — will retry next tick',
          confidence: 0,
          params: { error: message },
        },
      })
    }
  }
}
