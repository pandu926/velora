/**
 * Core types for the DeFi Autopilot agent system.
 * All numeric values that represent on-chain amounts use string
 * for serialization safety (no bigint in interfaces).
 */

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AgentDecision {
  action: 'hold' | 'swap' | 'supply' | 'withdraw' | 'rebalance'
  reasoning: string
  confidence: number
  params?: Record<string, unknown>
}

export interface TokenBalance {
  token: string
  address: string
  balance: string
  valueUsd: number
}

export interface MarketData {
  prices: Record<string, number>
  aaveRates: Record<string, { supply: number; borrow: number }>
  poolLiquidity: Record<string, number>
}

export interface StrategyRules {
  maxSpendPerTx: string
  allowedTokens: string[]
  rebalanceThreshold: number
  stopLossPercent: number
}

export interface AgentContext {
  portfolio: TokenBalance[]
  marketData: MarketData
  strategy: StrategyRules
}

/**
 * Minimal VeniceClient interface for dependency injection.
 * The actual implementation comes from venice-x402-client.
 */
export interface VeniceClient {
  chat(messages: AgentMessage[], options?: { model?: string; temperature?: number }): Promise<{ content: string; usage: { prompt_tokens: number; completion_tokens: number } }>
}
