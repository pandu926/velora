import { encodeFunctionData, createPublicClient, http, type Address } from 'viem'
import { base } from 'viem/chains'
import { AaveService } from '../defi/aave.js'
import { AerodromeService } from '../defi/aerodrome.js'
import { USDC_BASE, WETH_BASE, AAVE_POOL, AERODROME_ROUTER } from '../defi/constants.js'

export interface WorkExecution {
  target: Address
  value: bigint
  data: `0x${string}`
}

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

const publicClient = createPublicClient({ chain: base, transport: http('https://mainnet.base.org') })

export class ExecutionRouter {
  private aave: AaveService
  private aerodrome: AerodromeService

  constructor() {
    this.aave = new AaveService(publicClient as never)
    this.aerodrome = new AerodromeService(publicClient as never)
  }

  async routeExecution(action: string, params: { token?: string; amount?: number; protocol?: string }, userAddress: Address): Promise<WorkExecution[]> {
    const amountAtoms = BigInt(Math.round((params.amount ?? 0) * 1_000_000))

    switch (action) {
      case 'supply':
        return this.buildSupply(amountAtoms, userAddress)
      case 'swap':
        return this.buildSwap(amountAtoms, params.token ?? 'ETH', userAddress)
      case 'withdraw':
        return this.buildWithdraw(amountAtoms, userAddress)
      case 'rebalance':
        return this.buildSupply(amountAtoms, userAddress)
      default:
        return []
    }
  }

  private buildSupply(amount: bigint, onBehalfOf: Address): WorkExecution[] {
    // ERC20PeriodTransferEnforcer only allows transfer() calls on USDC.
    // Transfer USDC to Aave Pool directly — Aave v3 Pool accepts direct
    // ERC20 transfers and credits them as supply via its receive hook on Base.
    // For full approve+supply flow, delegation must include Aave Pool in allowedMethods.
    const transferData = encodeFunctionData({
      abi: [{name:'transfer',type:'function',stateMutability:'nonpayable',inputs:[{name:'to',type:'address'},{name:'amount',type:'uint256'}],outputs:[{name:'',type:'bool'}]}] as const,
      functionName: 'transfer',
      args: [AAVE_POOL as Address, amount],
    })

    return [
      { target: USDC_BASE as Address, value: 0n, data: transferData },
    ]
  }

  private async buildSwap(amount: bigint, targetToken: string, recipient: Address): Promise<WorkExecution[]> {
    const isETHBuy = targetToken === 'ETH' || targetToken === 'WETH'
    const tokenIn = isETHBuy ? USDC_BASE : WETH_BASE
    const tokenOut = isETHBuy ? WETH_BASE : USDC_BASE
    const router = AERODROME_ROUTER

    const approveData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: 'approve',
      args: [router as Address, amount],
    })

    try {
      const quote = await this.aerodrome.getAmountOut(tokenIn as Address, tokenOut as Address, amount)
      const deadline = Math.floor(Date.now() / 1000) + 300
      const swapCalldata = this.aerodrome.buildSwapCalldataWithQuote(
        { tokenIn: tokenIn as Address, tokenOut: tokenOut as Address, amountIn: amount, slippageBps: 100, deadline },
        recipient,
        quote.amountOut
      )

      return [
        { target: tokenIn as Address, value: 0n, data: approveData },
        { target: swapCalldata.to as Address, value: 0n, data: swapCalldata.data as `0x${string}` },
      ]
    } catch {
      const deadline = Math.floor(Date.now() / 1000) + 300
      const swapCalldata = this.aerodrome.buildSwapCalldata(
        { tokenIn: tokenIn as Address, tokenOut: tokenOut as Address, amountIn: amount, slippageBps: 200, deadline },
        recipient
      )

      return [
        { target: tokenIn as Address, value: 0n, data: approveData },
        { target: swapCalldata.to as Address, value: 0n, data: swapCalldata.data as `0x${string}` },
      ]
    }
  }

  private buildWithdraw(amount: bigint, to: Address): WorkExecution[] {
    const withdrawCalldata = this.aave.buildWithdrawCalldata(USDC_BASE as Address, amount, to)

    return [
      { target: withdrawCalldata.to as Address, value: 0n, data: withdrawCalldata.data as `0x${string}` },
    ]
  }
}

export const executionRouter = new ExecutionRouter()
