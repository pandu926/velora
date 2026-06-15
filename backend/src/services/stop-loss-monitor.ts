import type { Address } from 'viem'
import type { ActivityLog } from '../agents/activity-log.js'
import type { StrategyRules, TokenBalance } from '../agents/types.js'
import { AgentRole } from '../types/permissions.js'
import { revokeAllPermissions } from './kill-switch.js'

/**
 * Result of a stop-loss check against the portfolio.
 */
export interface StopLossCheckResult {
  triggered: boolean
  currentValue: number
  dropPercent: number
}

/**
 * Monitors portfolio value and triggers the kill switch
 * when the portfolio drops below the configured stop-loss threshold.
 *
 * This is a safety mechanism — no user intervention required.
 */
export class StopLossMonitor {
  private readonly activityLog: ActivityLog

  constructor(activityLog: ActivityLog) {
    this.activityLog = activityLog
  }

  /**
   * Compares current portfolio value against the initial value.
   * Returns whether the stop-loss threshold has been breached.
   */
  checkPortfolioValue(
    portfolio: ReadonlyArray<TokenBalance>,
    initialValue: number,
    strategy: Readonly<StrategyRules>
  ): StopLossCheckResult {
    if (initialValue <= 0) {
      return { triggered: false, currentValue: 0, dropPercent: 0 }
    }

    const currentValue = portfolio.reduce((sum, t) => sum + t.valueUsd, 0)
    const dropPercent = (initialValue - currentValue) / initialValue

    const triggered = dropPercent >= strategy.stopLossPercent

    return { triggered, currentValue, dropPercent }
  }

  /**
   * Activates the kill switch and logs the stop-loss event.
   * Called automatically when the stop-loss threshold is breached.
   */
  async triggerStopLoss(
    userAddress: Address,
    dropPercent: number,
    currentValue: number
  ): Promise<void> {
    const result = await revokeAllPermissions(userAddress)

    this.activityLog.add({
      agent: AgentRole.RiskGuardian,
      action: 'stop-loss-triggered',
      reasoning: `Portfolio dropped ${(dropPercent * 100).toFixed(2)}% (value: $${currentValue.toFixed(2)}). Kill switch activated — revoked ${result.revokedCount} delegation(s).`,
      decision: {
        action: 'withdraw',
        reasoning: 'Emergency stop-loss: all permissions revoked to protect remaining funds',
        confidence: 1,
        params: {
          dropPercent,
          currentValue,
          revokedCount: result.revokedCount,
          killSwitchSuccess: result.success,
        },
      },
    })
  }
}
