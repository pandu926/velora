import { type PublicClient, encodeFunctionData } from 'viem'
import { AERODROME_DEFAULT_FACTORY, AERODROME_ROUTER } from './constants.js'
import type { AerodromeRoute, SwapCalldata, SwapParams, SwapQuote } from './types.js'

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
          { name: 'factory', type: 'address' }
        ]
      }
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }]
  },
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      {
        name: 'routes',
        type: 'tuple[]',
        components: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'stable', type: 'bool' },
          { name: 'factory', type: 'address' }
        ]
      },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }]
  }
] as const

const BASIS_POINTS_DENOMINATOR = 10_000n

export class AerodromeService {
  private readonly publicClient: PublicClient

  /** Aerodrome router address — the execution target for swaps. */
  readonly routerAddress = AERODROME_ROUTER

  constructor(publicClient: PublicClient) {
    this.publicClient = publicClient
  }

  getRoute(tokenIn: `0x${string}`, tokenOut: `0x${string}`): AerodromeRoute[] {
    return [
      {
        from: tokenIn,
        to: tokenOut,
        stable: false,
        factory: AERODROME_DEFAULT_FACTORY
      }
    ]
  }

  async getAmountOut(
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: bigint
  ): Promise<SwapQuote> {
    const routes = this.getRoute(tokenIn, tokenOut)

    const amounts = await this.publicClient.readContract({
      address: AERODROME_ROUTER,
      abi: ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [amountIn, routes]
    })

    const amountOut = amounts[amounts.length - 1]

    return {
      amountOut,
      route: routes
    }
  }

  buildSwapCalldata(params: SwapParams, recipient: `0x${string}`): SwapCalldata {
    const routes = this.getRoute(params.tokenIn, params.tokenOut)

    const amountOutMin = this.applySlippage(params.amountIn, params.slippageBps)

    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [
        params.amountIn,
        amountOutMin,
        routes,
        recipient,
        BigInt(params.deadline)
      ]
    })

    return {
      to: AERODROME_ROUTER,
      data,
      value: 0n
    }
  }

  buildSwapCalldataWithQuote(
    params: SwapParams,
    recipient: `0x${string}`,
    quotedAmountOut: bigint
  ): SwapCalldata {
    const routes = this.getRoute(params.tokenIn, params.tokenOut)

    const amountOutMin = this.applySlippage(quotedAmountOut, params.slippageBps)

    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [
        params.amountIn,
        amountOutMin,
        routes,
        recipient,
        BigInt(params.deadline)
      ]
    })

    return {
      to: AERODROME_ROUTER,
      data,
      value: 0n
    }
  }

  private applySlippage(amount: bigint, slippageBps: number): bigint {
    const slippage = BigInt(slippageBps)
    return amount - (amount * slippage) / BASIS_POINTS_DENOMINATOR
  }
}
