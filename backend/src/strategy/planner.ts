import { config } from '../config/index.js'
import { realtimeFeeds } from '../services/realtime-feeds.js'

const VENICE_BASE_URL = config.veniceBaseUrl || 'https://api.venice.ai/api/v1'
const VENICE_API_KEY = config.veniceApiKey || ''

export interface StrategyAllocation {
  type: 'lending' | 'trading' | 'reserve' | 'arbitrage'
  protocol: string
  token: string
  percentage: number
  rationale: string
}

export interface StrategyRules {
  maxPositionPct: number
  stopLossPct: number
  takeProfitPct: number
  rebalanceThresholdPct: number
  maxDailyLossPct: number
  maxTradePerTx: number
}

export interface StrategyPlan {
  id: string
  allocations: StrategyAllocation[]
  rules: StrategyRules
  reasoning: string
  generatedAt: number
  marketContext: Record<string, unknown>
}

export interface StrategyTarget {
  targetValue: number
  currentValue: number
  riskLevel: 'conservative' | 'moderate' | 'aggressive'
  timeframe: string
}

export class StrategyPlanner {
  async generatePlan(target: StrategyTarget): Promise<StrategyPlan> {
    const snapshot = realtimeFeeds.getSnapshot()
    const btcPrice = (snapshot.prices as Record<string, { price: number }>)?.['BTCUSDT']?.price ?? 0
    const ethPrice = (snapshot.prices as Record<string, { price: number }>)?.['ETHUSDT']?.price ?? 0
    const fearGreed = (snapshot.fearGreed as { value: number; classification: string } | null)

    const prompt = `You are a DeFi portfolio strategist. Generate an allocation plan.

USER TARGET:
- Current portfolio: $${target.currentValue}
- Target: $${target.targetValue} (${((target.targetValue / target.currentValue - 1) * 100).toFixed(0)}% growth)
- Risk level: ${target.riskLevel}
- Timeframe: ${target.timeframe}

MARKET CONDITIONS:
- BTC: $${btcPrice.toFixed(0)}
- ETH: $${ethPrice.toFixed(0)}
- Fear & Greed: ${fearGreed?.value ?? 'unknown'} (${fearGreed?.classification ?? 'unknown'})
- Available protocols: Aave v3 (lending, ~3-5% APY), Aerodrome (swaps/LP)
- Chain: Base (low gas)

AVAILABLE STRATEGIES:
1. Lending (Aave v3): stable yield, low risk, withdrawable anytime
2. Trading (ETH/USDC via Aerodrome): directional, medium-high risk
3. Reserve (hold USDC): zero yield, zero risk, liquidity buffer
4. Arbitrage (funding rate / DEX price diff): opportunistic, requires speed

CONSTRAINTS:
- Conservative: max 80% lending, 10% trading, 10% reserve. No leverage.
- Moderate: max 70% lending, 25% trading, 5% reserve. Small directional bets OK.
- Aggressive: max 50% lending, 40% trading, 10% reserve. Larger positions OK.

Generate a JSON allocation plan. Be specific about WHY each allocation given current market.

JSON only:
{
  "allocations": [
    {"type":"lending"|"trading"|"reserve"|"arbitrage","protocol":"aave"|"aerodrome"|"wallet","token":"USDC"|"ETH","percentage":0-100,"rationale":"..."}
  ],
  "rules": {
    "maxPositionPct": number,
    "stopLossPct": number,
    "takeProfitPct": number,
    "rebalanceThresholdPct": number,
    "maxDailyLossPct": number,
    "maxTradePerTx": number
  },
  "reasoning": "1-2 sentence overall strategy rationale"
}`

    try {
      const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${VENICE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-V4-Flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) return this.defaultPlan(target)

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      const raw = data.choices?.[0]?.message?.content ?? ''
      return this.parsePlan(raw, target, { btcPrice, ethPrice, fearGreed })
    } catch {
      return this.defaultPlan(target)
    }
  }

  private parsePlan(raw: string, target: StrategyTarget, market: Record<string, unknown>): StrategyPlan {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*"allocations"[\s\S]*\}/)

    try {
      const parsed = JSON.parse(jsonMatch?.[0] ?? cleaned) as {
        allocations?: Array<{ type: string; protocol: string; token: string; percentage: number; rationale: string }>
        rules?: Record<string, number>
        reasoning?: string
      }

      const allocations: StrategyAllocation[] = (parsed.allocations ?? []).map(a => ({
        type: a.type as StrategyAllocation['type'],
        protocol: a.protocol,
        token: a.token,
        percentage: a.percentage,
        rationale: a.rationale,
      }))

      const rules: StrategyRules = {
        maxPositionPct: parsed.rules?.maxPositionPct ?? 30,
        stopLossPct: parsed.rules?.stopLossPct ?? 10,
        takeProfitPct: parsed.rules?.takeProfitPct ?? 25,
        rebalanceThresholdPct: parsed.rules?.rebalanceThresholdPct ?? 5,
        maxDailyLossPct: parsed.rules?.maxDailyLossPct ?? 3,
        maxTradePerTx: parsed.rules?.maxTradePerTx ?? Math.round(target.currentValue * 0.1),
      }

      return {
        id: crypto.randomUUID(),
        allocations,
        rules,
        reasoning: parsed.reasoning ?? '',
        generatedAt: Date.now(),
        marketContext: market,
      }
    } catch {
      return this.defaultPlan(target)
    }
  }

  private defaultPlan(target: StrategyTarget): StrategyPlan {
    const riskProfiles = {
      conservative: { lending: 80, trading: 10, reserve: 10, maxPos: 20, stopLoss: 5, takeProfit: 15 },
      moderate: { lending: 65, trading: 25, reserve: 10, maxPos: 30, stopLoss: 8, takeProfit: 25 },
      aggressive: { lending: 45, trading: 40, reserve: 15, maxPos: 40, stopLoss: 12, takeProfit: 40 },
    }

    const p = riskProfiles[target.riskLevel]

    return {
      id: crypto.randomUUID(),
      allocations: [
        { type: 'lending', protocol: 'aave', token: 'USDC', percentage: p.lending, rationale: 'Stable yield via Aave v3' },
        { type: 'trading', protocol: 'aerodrome', token: 'ETH', percentage: p.trading, rationale: 'ETH exposure for growth' },
        { type: 'reserve', protocol: 'wallet', token: 'USDC', percentage: p.reserve, rationale: 'Liquidity buffer' },
      ],
      rules: {
        maxPositionPct: p.maxPos,
        stopLossPct: p.stopLoss,
        takeProfitPct: p.takeProfit,
        rebalanceThresholdPct: 5,
        maxDailyLossPct: 3,
        maxTradePerTx: Math.round(target.currentValue * 0.1),
      },
      reasoning: `${target.riskLevel} strategy: ${p.lending}% lending for stable yield, ${p.trading}% trading for growth, ${p.reserve}% reserve.`,
      generatedAt: Date.now(),
      marketContext: {},
    }
  }
}

export const strategyPlanner = new StrategyPlanner()
