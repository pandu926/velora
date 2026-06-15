import type { CommanderAgent } from './commander.js'
import type { TraderAgent } from './trader.js'
import type { DebateEngine } from './debate-engine.js'
import type { AgentContext, AgentDecision, StrategyRules, TokenBalance } from './types.js'

interface DriftResult {
  token: string
  current: number
  target: number
  drift: number
}

interface DriftCheck {
  needsRebalance: boolean
  drifts: DriftResult[]
}

/**
 * Rebalancing Engine — monitors portfolio drift and triggers trades.
 *
 * Uses equal-weight target allocation (simplest strategy for hackathon).
 * When drift exceeds the strategy threshold, the Commander evaluates
 * and the Trader executes.
 */
export class RebalancerEngine {
  private readonly commanderAgent: CommanderAgent
  private readonly traderAgent: TraderAgent
  private readonly debateEngine: DebateEngine

  constructor(commanderAgent: CommanderAgent, traderAgent: TraderAgent, debateEngine: DebateEngine) {
    this.commanderAgent = commanderAgent
    this.traderAgent = traderAgent
    this.debateEngine = debateEngine
  }

  /**
   * Calculate portfolio drift from equal-weight target allocation.
   * Returns whether rebalancing is needed and per-token drift details.
   */
  checkDrift(portfolio: TokenBalance[], strategy: StrategyRules): DriftCheck {
    const totalValue = portfolio.reduce((sum, t) => sum + t.valueUsd, 0)

    if (totalValue === 0 || portfolio.length === 0) {
      return { needsRebalance: false, drifts: [] }
    }

    const targetPercent = 100 / portfolio.length

    const drifts: DriftResult[] = portfolio.map((token) => {
      const currentPercent = (token.valueUsd / totalValue) * 100
      const drift = Math.abs(currentPercent - targetPercent)

      return {
        token: token.token,
        current: currentPercent,
        target: targetPercent,
        drift,
      }
    })

    const needsRebalance = drifts.some(
      (d) => d.drift > strategy.rebalanceThreshold
    )

    return { needsRebalance, drifts }
  }

  /**
   * Full rebalance pipeline:
   * 1. Check drift against strategy threshold
   * 2. If rebalance needed, ask Commander to evaluate
   * 3. Execute trades based on Commander's decision
   * 4. Return all decisions made
   */
  async rebalance(
    context: AgentContext,
    delegation: `0x${string}`,
    recipient: `0x${string}`
  ): Promise<AgentDecision[]> {
    const { needsRebalance, drifts } = this.checkDrift(
      context.portfolio,
      context.strategy
    )

    if (!needsRebalance) {
      return [
        {
          action: 'hold',
          reasoning: 'Portfolio within drift threshold, no rebalance needed',
          confidence: 1,
          params: { drifts },
        },
      ]
    }

    // Run debate, then Commander evaluates the result
    const debateResult = await this.debateEngine.debate(context)
    const decision = await this.commanderAgent.evaluate(debateResult, context)
    const decisions: AgentDecision[] = [decision]

    // Execute based on Commander's decision.
    // All actionable verdicts settle on-chain via the proven gasless relayer
    // path (EIP-7702 + 7710 delegated USDC settlement). The pool-dependent
    // swap/supply routing is represented as a USDC settlement to the recipient,
    // which is the action verified on Base mainnet.
    const EXECUTABLE = new Set(['swap', 'supply', 'withdraw', 'rebalance'])
    if (EXECUTABLE.has(decision.action) && decision.params) {
      const rawAmount =
        (decision.params['amountIn'] as string | undefined) ??
        (decision.params['amount'] as string | undefined)

      if (rawAmount) {
        await this.traderAgent.settleTransfer(recipient, BigInt(rawAmount))
      }
    }

    return decisions
  }
}
