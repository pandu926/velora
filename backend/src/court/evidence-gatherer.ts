/**
 * Evidence Gatherer — collects on-chain evidence for the Evidence Court.
 * Reads real contract state via viem PublicClient. Falls back to mock
 * evidence (source: "mock") when RPC calls fail (e.g. testnet issues).
 */

import type { PublicClient } from 'viem'
import { erc20Abi } from 'viem'
import {
  AERODROME_ROUTER,
  AERODROME_DEFAULT_FACTORY,
  AAVE_POOL_DATA_PROVIDER,
  USDC_BASE,
  WETH_BASE,
  TOKENS,
} from '../defi/constants.js'
import type { Evidence } from './types.js'
import { gatherMarketEvidence } from './market-tools.js'

const ROUTER_ABI = [
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'stable', type: 'bool' },
          { name: 'factory', type: 'address' },
        ],
      },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

const POOL_DATA_PROVIDER_ABI = [
  {
    name: 'getReserveData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      { name: 'unbacked', type: 'uint256' },
      { name: 'accruedToTreasuryScaled', type: 'uint256' },
      { name: 'totalAToken', type: 'uint256' },
      { name: 'totalStableDebt', type: 'uint256' },
      { name: 'totalVariableDebt', type: 'uint256' },
      { name: 'liquidityRate', type: 'uint256' },
      { name: 'variableBorrowRate', type: 'uint256' },
      { name: 'stableBorrowRate', type: 'uint256' },
      { name: 'averageStableBorrowRate', type: 'uint256' },
      { name: 'liquidityIndex', type: 'uint256' },
      { name: 'variableBorrowIndex', type: 'uint256' },
      { name: 'lastUpdateTimestamp', type: 'uint40' },
    ],
  },
] as const

/** 1 USDC = 1e6 */
const ONE_USDC = 1_000_000n

/** RAY = 1e27 (Aave rate denominator) */
const RAY = 10n ** 27n

export class EvidenceGatherer {
  private readonly publicClient: PublicClient

  constructor(publicClient: PublicClient) {
    this.publicClient = publicClient
  }

  /**
   * Reads Aerodrome pool to get current price ratio between two tokens.
   */
  async gatherPriceEvidence(
    tokenA: `0x${string}`,
    tokenB: `0x${string}`
  ): Promise<Evidence> {
    const now = Date.now()

    try {
      const routes = [
        { from: tokenA, to: tokenB, stable: false, factory: AERODROME_DEFAULT_FACTORY },
      ]

      const amounts = await this.publicClient.readContract({
        address: AERODROME_ROUTER,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [ONE_USDC, routes],
      })

      const blockNumber = await this.publicClient.getBlockNumber()
      const amountOut = amounts[amounts.length - 1]

      return {
        type: 'price_data',
        source: AERODROME_ROUTER,
        data: {
          tokenA,
          tokenB,
          amountIn: ONE_USDC.toString(),
          amountOut: amountOut.toString(),
          route: 'volatile',
        },
        timestamp: now,
        blockNumber: Number(blockNumber),
        description: `Aerodrome price: ${ONE_USDC.toString()} of ${tokenA} → ${amountOut.toString()} of ${tokenB}`,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        type: 'price_data',
        source: 'mock',
        data: {
          tokenA,
          tokenB,
          amountIn: ONE_USDC.toString(),
          amountOut: '400000000000000', // mock ~0.0004 WETH per USDC
          error: message,
        },
        timestamp: now,
        description: `[MOCK] Aerodrome price for ${tokenA} → ${tokenB} (RPC unavailable)`,
      }
    }
  }

  /**
   * Reads pool liquidity and reserves for a token pair.
   */
  async gatherPoolStats(
    tokenA: `0x${string}`,
    tokenB: `0x${string}`
  ): Promise<Evidence> {
    const now = Date.now()

    try {
      // Read token balances held by the router as a proxy for pool liquidity
      const [balanceA, balanceB, blockNumber] = await Promise.all([
        this.publicClient.readContract({
          address: tokenA,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [AERODROME_ROUTER],
        }),
        this.publicClient.readContract({
          address: tokenB,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [AERODROME_ROUTER],
        }),
        this.publicClient.getBlockNumber(),
      ])

      return {
        type: 'pool_stats',
        source: AERODROME_ROUTER,
        data: {
          tokenA,
          tokenB,
          routerHeldA: balanceA.toString(),
          routerHeldB: balanceB.toString(),
          note: 'Router-held balances are transient and NOT pool liquidity; Aerodrome liquidity lives in pair contracts. Use yield_comparison TVL for real liquidity.',
        },
        timestamp: now,
        blockNumber: Number(blockNumber),
        description: `Aerodrome router transient balances (NOT pool reserves — see yield TVL for liquidity): ${tokenA}=${balanceA.toString()}, ${tokenB}=${balanceB.toString()}`,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        type: 'pool_stats',
        source: 'mock',
        data: {
          tokenA,
          tokenB,
          reserveA: '5000000000000', // mock 5M USDC
          reserveB: '2000000000000000000000', // mock 2000 WETH
          error: message,
        },
        timestamp: now,
        description: `[MOCK] Pool stats for ${tokenA}/${tokenB} (RPC unavailable)`,
      }
    }
  }

  /**
   * Reads Aave v3 supply/borrow rates via PoolDataProvider.
   */
  async gatherAaveRates(token: `0x${string}`): Promise<Evidence> {
    const now = Date.now()

    try {
      const result = await this.publicClient.readContract({
        address: AAVE_POOL_DATA_PROVIDER,
        abi: POOL_DATA_PROVIDER_ABI,
        functionName: 'getReserveData',
        args: [token],
      })

      const blockNumber = await this.publicClient.getBlockNumber()

      const [, , totalAToken, , , liquidityRate, variableBorrowRate] = result

      // Convert from RAY to percentage
      const supplyAPY = Number((liquidityRate * 10000n) / RAY) / 100
      const borrowAPY = Number((variableBorrowRate * 10000n) / RAY) / 100

      return {
        type: 'aave_rate',
        source: AAVE_POOL_DATA_PROVIDER,
        data: {
          token,
          liquidityRate: liquidityRate.toString(),
          variableBorrowRate: variableBorrowRate.toString(),
          totalAToken: totalAToken.toString(),
          supplyAPY,
          borrowAPY,
        },
        timestamp: now,
        blockNumber: Number(blockNumber),
        description: `Aave rates for ${token}: supply ${supplyAPY.toFixed(2)}% / borrow ${borrowAPY.toFixed(2)}%`,
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        type: 'aave_rate',
        source: 'mock',
        data: {
          token,
          supplyAPY: 3.5,
          borrowAPY: 5.5,
          totalAToken: '10000000000000',
          error: message,
        },
        timestamp: now,
        description: `[MOCK] Aave rates for ${token} (RPC unavailable)`,
      }
    }
  }

  /**
   * Reads ERC-20 token balances for an address. Returns null on failure so the
   * caller can omit it — never fabricates balances (mock balances would poison
   * the debate's portfolio reasoning).
   */
  async gatherBalanceSnapshot(
    address: `0x${string}`,
    tokens: `0x${string}`[]
  ): Promise<Evidence | null> {
    const now = Date.now()

    try {
      const balancePromises = tokens.map((token) =>
        this.publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [address],
        })
      )

      const [balances, blockNumber] = await Promise.all([
        Promise.all(balancePromises),
        this.publicClient.getBlockNumber(),
      ])

      const balanceMap: Record<string, string> = {}
      for (let i = 0; i < tokens.length; i++) {
        balanceMap[tokens[i]] = balances[i].toString()
      }

      return {
        type: 'balance_snapshot',
        source: address,
        data: { address, balances: balanceMap },
        timestamp: now,
        blockNumber: Number(blockNumber),
        description: `Balance snapshot for ${address}: ${tokens.length} tokens checked`,
      }
    } catch {
      // Omit rather than fabricate — fake balances would corrupt the debate.
      return null
    }
  }

  /**
   * Collects all relevant evidence for the current market state.
   * Used by the court to provide a comprehensive evidence package.
   */
  async gatherAllEvidence(context: {
    portfolioAddress?: `0x${string}`
  }): Promise<Evidence[]> {
    const evidence: Evidence[] = []

    // Price evidence: USDC → WETH
    const priceEvidence = await this.gatherPriceEvidence(USDC_BASE, WETH_BASE)
    evidence.push(priceEvidence)

    // Pool stats: USDC/WETH
    const poolStats = await this.gatherPoolStats(USDC_BASE, WETH_BASE)
    evidence.push(poolStats)

    // Aave rates for USDC and WETH
    const [usdcRates, wethRates] = await Promise.all([
      this.gatherAaveRates(USDC_BASE),
      this.gatherAaveRates(WETH_BASE),
    ])
    evidence.push(usdcRates)
    evidence.push(wethRates)

    // Balance snapshot if address provided (omitted if the read fails)
    if (context.portfolioAddress) {
      const tokenAddresses = TOKENS.map((t) => t.address as `0x${string}`)
      const balances = await this.gatherBalanceSnapshot(
        context.portfolioAddress,
        tokenAddresses
      )
      if (balances) evidence.push(balances)
    }

    // Live external market data: price momentum, sentiment, cross-protocol
    // yields, volatility. Failed tools are omitted (never fabricated), so this
    // only ever ADDS verifiable, current context to the debate.
    const marketEvidence = await gatherMarketEvidence()
    evidence.push(...marketEvidence)

    return evidence
  }
}
