import type { AerodromeService } from '../defi/aerodrome.js'
import type { AaveService } from '../defi/aave.js'
import type { SwapParams } from '../defi/types.js'
import { encodeFunctionData, type Hex } from 'viem'
import { ActivityLog } from './activity-log.js'
import { AgentRole } from '../types/permissions.js'
import { executeViaRelayer, type WorkExecution } from '../services/relayer-executor.js'
import { config } from '../config/index.js'

const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/**
 * Trader Agent — executes DeFi operations gaslessly via the 1Shot relayer.
 *
 * The Trader is a distinct A2A party (its own TRADER_PRIVATE_KEY). It receives
 * scoped authority from the Commander via redelegation, then settles the
 * approved action on-chain through the proven relayer-executor flow: the agent
 * EOA is EIP-7702-upgraded, a delegation to the relayer target is signed, gas
 * is paid in USDC, and the bundle is relayed. Proven on Base mainnet.
 */
export class TraderAgent {
  private readonly aerodromeService: AerodromeService
  private readonly aaveService: AaveService
  private readonly activityLog: ActivityLog

  constructor(
    aerodromeService: AerodromeService,
    aaveService: AaveService,
    activityLog: ActivityLog
  ) {
    this.aerodromeService = aerodromeService
    this.aaveService = aaveService
    this.activityLog = activityLog
  }

  /** The signing key for the Trader's own identity (falls back to the agent key). */
  private traderKey(): Hex {
    const key = (process.env.TRADER_PRIVATE_KEY ?? config.privateKey) as Hex
    if (!key) throw new Error('No trader/agent key configured for execution')
    return key
  }

  private destinationUrl(): string | undefined {
    return config.webhookBaseUrl
      ? `${config.webhookBaseUrl.replace(/\/$/, '')}/api/webhook/relayer`
      : undefined
  }

  /**
   * Settle an approved rebalance as a gasless USDC movement via the relayer.
   * This is the proven on-chain action (mainnet-verified): EIP-7702 upgrade +
   * 7710 delegated redeem + USDC gas, no native ETH required.
   *
   * @param recipient - Destination for the moved USDC
   * @param amount - USDC amount in 6-decimal atoms
   */
  async settleTransfer(
    recipient: `0x${string}`,
    amount: bigint
  ): Promise<{ txHash: string; status: string }> {
    this.activityLog.add({
      agent: AgentRole.Trader,
      action: 'settle',
      reasoning: `Settling ${amount} USDC to ${recipient} gaslessly via 1Shot (USDC gas, EIP-7702)`,
      decision: {
        action: 'swap',
        reasoning: `Gasless delegated USDC settlement of ${amount} to ${recipient}`,
        confidence: 1,
        params: { recipient, amount: amount.toString() },
      },
    })

    const buildWork = (usdc: `0x${string}`): WorkExecution[] => [
      {
        target: usdc,
        value: '0',
        data: encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [recipient, amount],
        }),
      },
    ]

    const outcome = await executeViaRelayer(this.traderKey(), buildWork, this.destinationUrl())

    this.activityLog.add({
      agent: AgentRole.Trader,
      action: 'settled',
      reasoning: `Relayer task ${outcome.taskId} → ${outcome.status}${outcome.txHash ? ` (tx ${outcome.txHash})` : ''}`,
      decision: {
        action: 'swap',
        reasoning: `On-chain settlement ${outcome.status}`,
        confidence: 1,
        params: { taskId: outcome.taskId, txHash: outcome.txHash ?? '', status: outcome.status },
      },
    })

    return { txHash: outcome.txHash ?? '', status: outcome.status }
  }
}
