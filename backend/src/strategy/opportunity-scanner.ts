import { EventEmitter } from 'node:events'
import { realtimeFeeds, type PriceUpdate, type FundingUpdate, type OnChainEvent, type FearGreedUpdate, type LiquidationEvent } from '../services/realtime-feeds.js'
import type { StrategyPlan } from './planner.js'
import { MoneyManager, type ExecutionIntent } from './money-manager.js'

export interface Opportunity {
  id: string
  type: 'buy_dip' | 'take_profit' | 'stop_loss' | 'rebalance' | 'yield_change' | 'whale_alert' | 'funding_arb' | 'fear_greed' | 'target_reached' | 'initial_allocation'
  proposal: string
  intent: ExecutionIntent
  priority: 'urgent' | 'normal' | 'low'
  trigger: string
  timestamp: number
  marketData: Record<string, unknown>
  confidence?: number
}

const THROTTLE_MS = 120000
const SAME_TYPE_COOLDOWN_MS = 600000
const PRICE_DIP_THRESHOLD = 0.02
const PRICE_PUMP_THRESHOLD = 0.08
const FUNDING_EXTREME_THRESHOLD = 0.001
const FEAR_EXTREME_LOW = 25
const FEAR_EXTREME_HIGH = 75

export class OpportunityScanner extends EventEmitter {
  private plan: StrategyPlan | null = null
  private moneyManager: MoneyManager | null = null
  private lastProposalTime = 0
  private lastProposalByType: Map<string, number> = new Map()
  private running = false
  private priceBaseline: Map<string, number> = new Map()
  private boardroomBusy = false
  private driftCheckInterval: ReturnType<typeof setInterval> | null = null
  private reviewInterval: ReturnType<typeof setInterval> | null = null

  configure(plan: StrategyPlan, moneyManager: MoneyManager): void {
    this.plan = plan
    this.moneyManager = moneyManager

    const ethPrice = realtimeFeeds.getLatestPrices().get('ETHUSDT')?.price
    if (ethPrice) this.priceBaseline.set('ETHUSDT', ethPrice)
  }

  start(): void {
    if (this.running || !this.plan || !this.moneyManager) return
    this.running = true

    realtimeFeeds.on('price', this.handlePrice)
    realtimeFeeds.on('funding', this.handleFunding)
    realtimeFeeds.on('onchain', this.handleOnChain)
    realtimeFeeds.on('fear_greed', this.handleFearGreed)
    realtimeFeeds.on('liquidation', this.handleLiquidation)

    this.driftCheckInterval = setInterval(() => this.checkDrift(), 60000)
    this.reviewInterval = setInterval(() => this.periodicReview(), 3600_000)

    console.log('[OpportunityScanner] Started — listening to real-time feeds')
  }

  stop(): void {
    this.running = false
    realtimeFeeds.off('price', this.handlePrice)
    realtimeFeeds.off('funding', this.handleFunding)
    realtimeFeeds.off('onchain', this.handleOnChain)
    realtimeFeeds.off('fear_greed', this.handleFearGreed)
    realtimeFeeds.off('liquidation', this.handleLiquidation)
    if (this.driftCheckInterval) clearInterval(this.driftCheckInterval)
    if (this.reviewInterval) { clearInterval(this.reviewInterval); this.reviewInterval = null }
    console.log('[OpportunityScanner] Stopped')
  }

  setBoardroomBusy(busy: boolean): void {
    this.boardroomBusy = busy
  }

  private handlePrice = (update: PriceUpdate): void => {
    if (update.symbol !== 'ETHUSDT') return
    if (!this.priceBaseline.has('ETHUSDT')) {
      this.priceBaseline.set('ETHUSDT', update.price)
      return
    }

    const baseline = this.priceBaseline.get('ETHUSDT')!
    const change = (update.price - baseline) / baseline

    if (change <= -PRICE_DIP_THRESHOLD) {
      const amount = this.moneyManager!.calculateAmount(
        { action: 'swap', token: 'ETH', amount: 0, protocol: 'aerodrome' },
        this.plan!
      )
      if (amount <= 0) return

      this.proposeOpportunity({
        type: 'buy_dip',
        proposal: `ETH dropped ${(Math.abs(change) * 100).toFixed(1)}% from $${baseline.toFixed(0)} to $${update.price.toFixed(0)}. Buy the dip: swap $${amount.toFixed(0)} USDC to ETH via Aerodrome. This is within the trading allocation (${this.plan!.allocations.find(a => a.type === 'trading')?.percentage ?? 0}%).`,
        intent: { action: 'swap', token: 'ETH', amount, protocol: 'aerodrome' },
        priority: 'normal',
        trigger: `ETH -${(Math.abs(change) * 100).toFixed(1)}% from baseline`,
        marketData: { baseline, current: update.price, change },
      })
      this.priceBaseline.set('ETHUSDT', update.price)
    }

    if (change >= PRICE_PUMP_THRESHOLD && this.moneyManager!.checkTakeProfit()) {
      const tradingValue = this.moneyManager!.getState().allocations['trading']?.value ?? 0
      if (tradingValue <= 0) return

      this.proposeOpportunity({
        type: 'take_profit',
        proposal: `ETH rose ${(change * 100).toFixed(1)}% from entry. Take profit: swap ${tradingValue.toFixed(0)} USDC worth of ETH back to USDC via Aerodrome. Lock in gains.`,
        intent: { action: 'swap', token: 'USDC', amount: tradingValue, protocol: 'aerodrome', target: 'USDC' },
        priority: 'normal',
        trigger: `ETH +${(change * 100).toFixed(1)}% take-profit threshold`,
        marketData: { baseline, current: update.price, change },
      })
    }

    if (this.moneyManager!.checkStopLoss()) {
      const tradingValue = this.moneyManager!.getState().allocations['trading']?.value ?? 0
      if (tradingValue <= 0) return

      this.proposeOpportunity({
        type: 'stop_loss',
        proposal: `STOP LOSS: ETH dropped ${(Math.abs(change) * 100).toFixed(1)}% from entry price. Emergency exit: sell all ETH position ($${tradingValue.toFixed(0)}) back to USDC to prevent further loss.`,
        intent: { action: 'swap', token: 'USDC', amount: tradingValue, protocol: 'aerodrome', target: 'USDC' },
        priority: 'urgent',
        trigger: `Stop-loss triggered at -${this.moneyManager!['rules'].stopLossPct}%`,
        marketData: { baseline, current: update.price, change },
      })
    }
  }

  private handleFunding = (update: FundingUpdate): void => {
    if (Math.abs(update.rate) < FUNDING_EXTREME_THRESHOLD) return

    const direction = update.rate > 0 ? 'longs paying shorts' : 'shorts paying longs'
    this.proposeOpportunity({
      type: 'funding_arb',
      proposal: `Extreme funding rate on ${update.symbol}: ${(update.rate * 100).toFixed(4)}% (${direction}). This signals over-leveraged ${update.rate > 0 ? 'longs' : 'shorts'} — potential mean-reversion opportunity.`,
      intent: { action: 'swap', token: update.rate > 0 ? 'USDC' : 'ETH', amount: 0, protocol: 'aerodrome' },
      priority: 'low',
      trigger: `Funding rate ${(update.rate * 100).toFixed(4)}%`,
      marketData: { symbol: update.symbol, rate: update.rate, nextFunding: update.nextFundingTime },
    })
  }

  private handleOnChain = (event: OnChainEvent): void => {
    if (event.type === 'whale_transfer') {
      const amount = (event.data as { amount?: number }).amount ?? 0
      this.proposeOpportunity({
        type: 'whale_alert',
        proposal: `Large USDC transfer detected on Base: $${amount.toLocaleString()}. This may indicate significant market participant activity. Monitor for price impact.`,
        intent: { action: 'rebalance', token: 'USDC', amount: 0, protocol: 'aave' },
        priority: 'low',
        trigger: `Whale transfer: $${amount.toLocaleString()} USDC`,
        marketData: event.data,
      })
    }

    if (event.type === 'aave_rate_update') {
      const lendingAlloc = this.plan?.allocations.find(a => a.type === 'lending')
      if (!lendingAlloc) return

      const currentLending = this.moneyManager!.getState().allocations['lending']?.value ?? 0
      const targetLending = (lendingAlloc.percentage / 100) * this.moneyManager!.getState().totalValue

      if (currentLending < targetLending * 0.8) {
        const deficit = targetLending - currentLending
        this.proposeOpportunity({
          type: 'yield_change',
          proposal: `Aave rate update detected. Current lending allocation ($${currentLending.toFixed(0)}) is below target ($${targetLending.toFixed(0)}). Supply $${deficit.toFixed(0)} USDC to Aave v3 to match strategy allocation.`,
          intent: { action: 'supply', token: 'USDC', amount: deficit, protocol: 'aave' },
          priority: 'normal',
          trigger: 'Aave rate update + lending under-allocation',
          marketData: event.data,
        })
      }
    }
  }

  private handleFearGreed = (update: FearGreedUpdate): void => {
    if (update.value <= FEAR_EXTREME_LOW) {
      const amount = this.moneyManager!.calculateAmount(
        { action: 'swap', token: 'ETH', amount: 0, protocol: 'aerodrome' },
        this.plan!
      )
      if (amount <= 0) return

      this.proposeOpportunity({
        type: 'fear_greed',
        proposal: `Extreme Fear detected (F&G: ${update.value}). Historically, extreme fear is a buying opportunity. Proposal: swap $${amount.toFixed(0)} USDC to ETH via Aerodrome (contrarian play within trading allocation).`,
        intent: { action: 'swap', token: 'ETH', amount, protocol: 'aerodrome' },
        priority: 'low',
        trigger: `Fear & Greed: ${update.value} (${update.classification})`,
        marketData: { value: update.value, classification: update.classification },
      })
    }

    if (update.value >= FEAR_EXTREME_HIGH) {
      const tradingValue = this.moneyManager!.getState().allocations['trading']?.value ?? 0
      if (tradingValue <= 0) return

      this.proposeOpportunity({
        type: 'fear_greed',
        proposal: `Extreme Greed detected (F&G: ${update.value}). Market may be overheated. Proposal: de-risk by selling $${(tradingValue * 0.5).toFixed(0)} of ETH position back to USDC.`,
        intent: { action: 'swap', token: 'USDC', amount: tradingValue * 0.5, protocol: 'aerodrome', target: 'USDC' },
        priority: 'normal',
        trigger: `Fear & Greed: ${update.value} (${update.classification})`,
        marketData: { value: update.value, classification: update.classification },
      })
    }
  }

  private handleLiquidation = (event: LiquidationEvent): void => {
    if (event.quantity * event.price < 100000) return

    const value = (event.quantity * event.price).toFixed(0)
    this.emit('alert', {
      type: 'liquidation_alert',
      message: `Large ${event.side} liquidation on ${event.symbol}: $${value}`,
      data: event,
    })
  }

  private checkDrift(): void {
    if (!this.plan || !this.moneyManager) return

    const { drifted, driftDetails } = this.moneyManager.checkDrift(this.plan)
    if (!drifted) return

    const detail = driftDetails[0]!
    const amount = this.moneyManager.calculateAmount(
      { action: 'rebalance', token: 'USDC', amount: 0, protocol: 'aave' },
      this.plan
    )

    this.proposeOpportunity({
      type: 'rebalance',
      proposal: `Portfolio drift detected: ${detail.type} allocation is ${detail.actual.toFixed(1)}% vs target ${detail.target.toFixed(1)}% (${detail.drift.toFixed(1)}% drift). Rebalance to restore strategy allocation.`,
      intent: { action: detail.type === 'lending' ? 'supply' : 'swap', token: 'USDC', amount: Math.abs(amount), protocol: detail.type === 'lending' ? 'aave' : 'aerodrome' },
      priority: 'normal',
      trigger: `Drift: ${detail.type} ${detail.drift.toFixed(1)}% (threshold: ${this.moneyManager['rules'].rebalanceThresholdPct}%)`,
      marketData: { driftDetails },
    })
  }

  private periodicReview(): void {
    if (this.boardroomBusy || !this.plan || !this.moneyManager) return

    const state = this.moneyManager.getState()
    const prices = realtimeFeeds.getLatestPrices()
    const eth = prices.get('ETHUSDT')

    this.proposeOpportunity({
      type: 'rebalance',
      trigger: 'Hourly portfolio review',
      proposal: `Periodic review: portfolio $${state.totalValue.toFixed(2)}, ETH $${eth?.price?.toFixed(0) ?? '?'}. Evaluate if current allocation is optimal given market conditions.`,
      priority: 'normal',
      marketData: { portfolio: state, ethPrice: eth?.price },
      intent: { action: 'rebalance', token: 'USDC', amount: state.totalValue * 0.1, protocol: 'aave' },
    })
  }

  private proposeOpportunity(partial: Omit<Opportunity, 'id' | 'timestamp'>): void {
    if (!this.running) return
    if (this.boardroomBusy) return
    if (this.moneyManager!.checkDailyLossLimit() && partial.type !== 'stop_loss') return

    const now = Date.now()
    if (partial.type !== 'stop_loss' && now - this.lastProposalTime < THROTTLE_MS) return

    const lastSameType = this.lastProposalByType.get(partial.type) ?? 0
    if (partial.type !== 'stop_loss' && now - lastSameType < SAME_TYPE_COOLDOWN_MS) return

    const check = this.moneyManager!.canExecute(partial.intent)
    if (!check.allowed && partial.type !== 'stop_loss') return

    const opportunity: Opportunity = {
      ...partial,
      id: crypto.randomUUID(),
      timestamp: now,
    }

    this.lastProposalTime = now
    this.lastProposalByType.set(partial.type, now)

    this.emit('opportunity', opportunity)
  }
}

export const opportunityScanner = new OpportunityScanner()
