import { type PublicClient, encodeFunctionData } from 'viem'
import { AAVE_POOL, AAVE_POOL_DATA_PROVIDER } from './constants.js'
import type { LendingResult, ReserveData, UserAccountData } from './types.js'

const POOL_ABI = [
  {
    name: 'supply',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'onBehalfOf', type: 'address' },
      { name: 'referralCode', type: 'uint16' }
    ],
    outputs: []
  },
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'to', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'getUserAccountData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      { name: 'totalCollateralBase', type: 'uint256' },
      { name: 'totalDebtBase', type: 'uint256' },
      { name: 'availableBorrowsBase', type: 'uint256' },
      { name: 'currentLiquidationThreshold', type: 'uint256' },
      { name: 'ltv', type: 'uint256' },
      { name: 'healthFactor', type: 'uint256' }
    ]
  }
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
      { name: 'lastUpdateTimestamp', type: 'uint40' }
    ]
  }
] as const

export class AaveService {
  private readonly publicClient: PublicClient

  /** Aave v3 Pool address — the execution target for supply/withdraw. */
  readonly poolAddress = AAVE_POOL

  constructor(publicClient: PublicClient) {
    this.publicClient = publicClient
  }

  async getUserAccountData(userAddress: `0x${string}`): Promise<UserAccountData> {
    const result = await this.publicClient.readContract({
      address: AAVE_POOL,
      abi: POOL_ABI,
      functionName: 'getUserAccountData',
      args: [userAddress]
    })

    const [
      totalCollateralBase,
      totalDebtBase,
      availableBorrowsBase,
      ,
      ,
      healthFactor
    ] = result

    return {
      totalCollateralBase,
      totalDebtBase,
      availableBorrowsBase,
      healthFactor
    }
  }

  async getReserveData(tokenAddress: `0x${string}`): Promise<ReserveData> {
    const result = await this.publicClient.readContract({
      address: AAVE_POOL_DATA_PROVIDER,
      abi: POOL_DATA_PROVIDER_ABI,
      functionName: 'getReserveData',
      args: [tokenAddress]
    })

    const [
      ,
      ,
      totalAToken,
      ,
      ,
      liquidityRate,
      variableBorrowRate
    ] = result

    return {
      liquidityRate,
      variableBorrowRate,
      totalAToken
    }
  }

  buildSupplyCalldata(
    token: `0x${string}`,
    amount: bigint,
    onBehalfOf: `0x${string}`
  ): LendingResult {
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'supply',
      args: [token, amount, onBehalfOf, 0]
    })

    return {
      to: AAVE_POOL,
      data,
      value: 0n
    }
  }

  buildWithdrawCalldata(
    token: `0x${string}`,
    amount: bigint,
    to: `0x${string}`
  ): LendingResult {
    const data = encodeFunctionData({
      abi: POOL_ABI,
      functionName: 'withdraw',
      args: [token, amount, to]
    })

    return {
      to: AAVE_POOL,
      data,
      value: 0n
    }
  }
}
