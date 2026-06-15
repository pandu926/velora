import type { StrategyPlan, StrategyRules } from './planner.js'
import { realtimeFeeds } from '../services/realtime-feeds.js'

export interface PortfolioState {
  totalValue: number
  allocations: Record<string, { value: number; percentage: number; token: string }>
  entryPrices: Record<string, number>
  realizedPnL: number
  unrealizedPnL: number
  dailyPnL: number
  dailyPnLReset: number
  targetProgress: number
}

export interface ExecutionIntent {
  action: 'supply' | 'swap' | 'withdraw' | 'rebalance'
  token: string
  amount: number
  protocol: string
  target?: string
}

export class MoneyManager {
  private state: PortfolioState
  private rules: StrategyRules
  private targetValue: number

  constructor(initialValue: number, targetValue: number, rules: StrategyRules) {
    this.targetValue = targetValue
    this.rules = rules
    this.state = {
      totalValue: initialValue,
      allocations: {
        lending: { value: 0, percentage: 0, token: 'USDC' },
        trading: { value: 0, percentage: 0, token: 'ETH' },
        reserve: { value: initialValue, percentage: 100, token: 'USDC' },
      },
      entryPrices: {},
      realizedPnL: 0,
      unrealizedPnL: 0,
      dailyPnL: 0,
      dailyPnLReset: Date.now(),
      targetProgress: 0,
    }
  }

  updateRules(rules: StrategyRules): void {
    this.rules = { ...rules }
  }

  canExecute(intent: ExecutionIntent): { allowed: boolean; reason: string } {
    if (this.checkDailyLossLimit()) {
      return { allowed: false, reason: `Daily loss limit hit (${this.rules.maxDailyLossPct}%)` }
    }

    const positionPct = (intent.amount / this.state.totalValue) * 100
    if (positionPct > this.rules.maxPositionPct) {
      return { allowed: false, reason: `Position ${positionPct.toFixed(1)}% exceeds max ${this.rules.maxPositionPct}%` }
    }

    if (intent.amount > this.rules.maxTradePerTx) {
      return { allowed: false, reason: `Amount $${intent.amount} exceeds max per-tx $${this.rules.maxTradePerTx}` }
    }

    const reserveAfter = (this.state.allocations['reserve']?.value ?? 0) - intent.amount
    if (intent.action === 'swap' && reserveAfter < this.state.totalValue * 0.05) {
      return { allowed: false, reason: 'Would deplete reserve below 5% minimum' }
    }

    return { allowed: true, reason: 'Within limits' }
  }

  calculateAmount(intent: ExecutionIntent, plan: StrategyPlan): number {
    const actionToType: Record<string, string> = { supply: 'lending', swap: 'trading', withdraw: 'lending', rebalance: 'lending' }
    const targetType = actionToType[intent.action] ?? 'reserve'

    const allocation = plan.allocations.find(a => a.type === targetType)

    if (!allocation) return 0

    const targetAllocation = (allocation.percentage / 100) * this.state.totalValue
    const currentAllocation = this.state.allocations[allocation.type]?.value ?? 0
    const deficit = targetAllocation - currentAllocation

    if (deficit <= 0) return 0

    return Math.min(deficit, this.rules.maxTradePerTx, this.state.allocations['reserve']?.value ?? 0)
  }

  trackExecution(intent: ExecutionIntent, success: boolean, txHash?: string): void {
    if (!success) return

    const amount = intent.amount

    if (intent.action === 'supply') {
      this.state.allocations['lending'] = {
        value: (this.state.allocations['lending']?.value ?? 0) + amount,
        percentage: 0,
        token: 'USDC',
      }
      this.state.allocations['reserve'] = {
        value: (this.state.allocations['reserve']?.value ?? 0) - amount,
        percentage: 0,
        token: 'USDC',
      }
    }

    if (intent.action === 'swap') {
      const ethPrice = realtimeFeeds.getLatestPrices().get('ETHUSDT')?.price ?? 1669
      this.state.allocations['trading'] = {
        value: (this.state.allocations['trading']?.value ?? 0) + amount,
        percentage: 0,
        token: 'ETH',
      }
      this.state.allocations['reserve'] = {
        value: (this.state.allocations['reserve']?.value ?? 0) - amount,
        percentage: 0,
        token: 'USDC',
      }
      this.state.entryPrices['ETH'] = ethPrice
    }

    if (intent.action === 'withdraw') {
      this.state.allocations['lending'] = {
        value: Math.max(0, (this.state.allocations['lending']?.value ?? 0) - amount),
        percentage: 0,
        token: 'USDC',
      }
      this.state.allocations['reserve'] = {
        value: (this.state.allocations['reserve']?.value ?? 0) + amount,
        percentage: 0,
        token: 'USDC',
      }
    }

    this.recalculatePercentages()
  }

  checkStopLoss(): boolean {
    const ethEntry = this.state.entryPrices['ETH']
    if (!ethEntry) return false

    const currentPrice = realtimeFeeds.getLatestPrices().get('ETHUSDT')?.price ?? ethEntry
    const loss = ((ethEntry - currentPrice) / ethEntry) * 100
    return loss >= this.rules.stopLossPct
  }

  checkTakeProfit(): boolean {
    const ethEntry = this.state.entryPrices['ETH']
    if (!ethEntry) return false

    const currentPrice = realtimeFeeds.getLatestPrices().get('ETHUSDT')?.price ?? ethEntry
    const gain = ((currentPrice - ethEntry) / ethEntry) * 100
    return gain >= this.rules.takeProfitPct
  }

  checkDailyLossLimit(): boolean {
    const now = Date.now()
    if (now - this.state.dailyPnLReset > 86400000) {
      this.state.dailyPnL = 0
      this.state.dailyPnLReset = now
    }

    const lossPct = (Math.abs(Math.min(0, this.state.dailyPnL)) / this.state.totalValue) * 100
    return lossPct >= this.rules.maxDailyLossPct
  }

  checkTargetReached(): boolean {
    return this.state.totalValue >= this.targetValue
  }

  checkDrift(plan: StrategyPlan): { drifted: boolean; driftDetails: Array<{ type: string; actual: number; target: number; drift: number }> } {
    const details: Array<{ type: string; actual: number; target: number; drift: number }> = []

    for (const alloc of plan.allocations) {
      const current = this.state.allocations[alloc.type]?.percentage ?? 0
      const drift = Math.abs(current - alloc.percentage)
      if (drift > this.rules.rebalanceThresholdPct) {
        details.push({ type: alloc.type, actual: current, target: alloc.percentage, drift })
      }
    }

    return { drifted: details.length > 0, driftDetails: details }
  }

  getState(): PortfolioState {
    this.updateUnrealizedPnL()
    this.state.targetProgress = ((this.state.totalValue - (this.targetValue - this.targetValue + this.state.totalValue)) / this.targetValue) * 100
    return { ...this.state }
  }

  private updateUnrealizedPnL(): void {
    const ethEntry = this.state.entryPrices['ETH']
    if (!ethEntry) {
      this.state.unrealizedPnL = 0
      return
    }

    const currentPrice = realtimeFeeds.getLatestPrices().get('ETHUSDT')?.price ?? ethEntry
    const ethValue = this.state.allocations['trading']?.value ?? 0
    const ethAmount = ethValue / ethEntry
    this.state.unrealizedPnL = (currentPrice - ethEntry) * ethAmount
    this.state.totalValue = Object.values(this.state.allocations).reduce((sum, a) => sum + a.value, 0) + this.state.unrealizedPnL
  }

  private recalculatePercentages(): void {
    const total = Object.values(this.state.allocations).reduce((sum, a) => sum + a.value, 0)
    if (total === 0) return

    for (const key of Object.keys(this.state.allocations)) {
      this.state.allocations[key]!.percentage = (this.state.allocations[key]!.value / total) * 100
    }
    this.state.totalValue = total
  }
}
