import { Router, type Request, type Response } from 'express'
import type { StrategyRules } from '../agents/types.js'

const strategyRouter: Router = Router()

let strategyRules: StrategyRules = {
  maxSpendPerTx: '100000000', // 100 USDC (6 decimals)
  allowedTokens: [
    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    '0x4200000000000000000000000000000000000006', // WETH
    '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', // cbETH
  ],
  rebalanceThreshold: 5,
  stopLossPercent: 20,
}

/**
 * GET /api/strategy
 * Returns the current strategy rules configuration.
 */
strategyRouter.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: strategyRules })
})

/**
 * PUT /api/strategy
 * Merges the request body into the current strategy rules.
 * Returns the updated configuration.
 */
strategyRouter.put('/', (req: Request, res: Response) => {
  const body = req.body as Partial<StrategyRules>

  strategyRules = { ...strategyRules, ...body }

  res.json({ success: true, data: strategyRules })
})

export { strategyRouter }
