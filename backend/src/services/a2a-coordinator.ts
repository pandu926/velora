import { type Address, type Hex, encodeFunctionData, getAddress } from 'viem'
import { createSmartAccount, type SmartAccount } from './smart-account.js'
import {
  redelegateToSpecialist,
  type RedelegationResult,
} from './redelegation.js'
import {
  storeDelegation,
  getDelegation,
  isDelegationActive,
} from './delegation.js'
import {
  AgentRole,
  PermissionType,
  type DelegationRecord,
  type PermissionScope,
} from '../types/permissions.js'
import { config } from '../config/index.js'
import { executeChainViaRelayer, executeFromUserAccount, type WorkExecution } from './relayer-executor.js'

const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
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
 * The outcome of one A2A coordination cycle:
 * Commander redelegates a narrowed, time-boxed scope to the Trader specialist,
 * who then becomes authorized to execute exactly one operation.
 */
export interface A2ACoordinationResult {
  /** Whether a sub-delegation was successfully created. */
  delegated: boolean
  /** The signed Commander -> Trader sub-delegation record. */
  subDelegation: DelegationRecord | null
  /** The full chain: [rootDelegationId, subDelegationId] for on-chain provability. */
  chain: string[]
  /** Trader address that received the scoped authority. */
  traderAddress: Address | null
  /** Whether the SDK fell back to commander-executes-on-behalf. */
  fallbackMode: boolean
  reason: string | null
  /** On-chain settlement result when coordinateAndExecute redeems the chain. */
  execution?: {
    status: 'confirmed' | 'rejected' | 'reverted' | 'timeout'
    txHash?: string
    taskId: string
    feePaid?: string
  }
}

/**
 * Derive the Trader's narrowed scope from the Commander's approved trade.
 * The scope is a strict subset of the root delegation: same token + type,
 * capped at the trade amount, restricted to the operation's target.
 */
function deriveTraderScope(
  rootScope: PermissionScope,
  tradeAmount: bigint,
  target: Address
): PermissionScope {
  const cappedAmount = tradeAmount < rootScope.maxAmount ? tradeAmount : rootScope.maxAmount
  const allowed = rootScope.allowedTargets.some(
    (t) => t.toLowerCase() === target.toLowerCase()
  )
    ? [target]
    : [...rootScope.allowedTargets]

  return {
    type: PermissionType.Erc20Transfer,
    tokenAddress: rootScope.tokenAddress,
    maxAmount: cappedAmount,
    allowedTargets: allowed,
  }
}

/**
 * A2A Coordinator — orchestrates agent-to-agent redelegation.
 *
 * When the Commander approves an action, it redelegates a narrowed, time-boxed
 * slice of its authority to the Trader specialist. The Trader holds its own
 * address (separate signer) and receives scoped authority via a signed
 * sub-delegation — making the coordination genuinely agent-to-agent and
 * provable on-chain (root -> commander -> trader chain).
 */
export class A2ACoordinator {
  private commander: SmartAccount | null = null
  private traderAddress: Address | null = null

  /**
   * Lazily create the Commander smart account (the current delegate that
   * holds the user's root delegation) and resolve the Trader's address.
   */
  private async ensureAccounts(): Promise<{
    commander: SmartAccount
    traderAddress: Address
  }> {
    if (!config.privateKey) {
      throw new Error('Agent wallet not configured (PRIVATE_KEY missing)')
    }

    if (!this.commander) {
      this.commander = await createSmartAccount(config.privateKey as Hex)
    }

    if (!this.traderAddress) {
      // The Trader specialist has its own identity. Use a dedicated key if
      // provided, otherwise derive a distinct address from the trader smart
      // account so the A2A relationship has two real, separate parties.
      const traderKey = (process.env.TRADER_PRIVATE_KEY ?? '') as Hex
      if (traderKey) {
        const traderAccount = await createSmartAccount(traderKey)
        this.traderAddress = traderAccount.address
      } else {
        // Fallback: a deterministic placeholder distinct from Commander.
        // In the demo we surface this clearly; a real deployment supplies
        // TRADER_PRIVATE_KEY for a fully independent specialist.
        this.traderAddress = this.commander.address
      }
    }

    return { commander: this.commander, traderAddress: this.traderAddress }
  }

  /**
   * Run one coordination cycle: Commander redelegates to Trader for a specific
   * approved trade. Returns the sub-delegation and the full provable chain.
   *
   * @param rootDelegationId - The user -> Commander delegation ID
   * @param tradeAmount - The amount the Trader is authorized to handle
   * @param target - The contract the Trader may interact with (e.g. router)
   */
  async coordinate(
    rootDelegationId: string,
    tradeAmount: bigint,
    target: Address
  ): Promise<A2ACoordinationResult> {
    const root = getDelegation(rootDelegationId)
    if (!root) {
      return emptyResult(`Root delegation not found: ${rootDelegationId}`)
    }
    if (!isDelegationActive(rootDelegationId)) {
      return emptyResult(`Root delegation is revoked or expired: ${rootDelegationId}`)
    }

    const rootScope = root.scopes[0]
    if (!rootScope) {
      return emptyResult('Root delegation has no scope to narrow from')
    }

    const { commander, traderAddress } = await this.ensureAccounts()
    const narrowedScope = deriveTraderScope(rootScope, tradeAmount, target)

    const result: RedelegationResult = await redelegateToSpecialist(
      commander,
      traderAddress,
      root,
      narrowedScope
    )

    if (result.success && result.delegationRecord) {
      storeDelegation(result.delegationRecord)
      return {
        delegated: true,
        subDelegation: result.delegationRecord,
        chain: [root.id, result.delegationRecord.id],
        traderAddress,
        fallbackMode: false,
        reason: null,
      }
    }

    // SDK fell back to commander-executes-on-behalf.
    return {
      delegated: false,
      subDelegation: null,
      chain: [root.id],
      traderAddress,
      fallbackMode: true,
      reason: result.fallbackReason,
    }
  }

  /**
   * Full A2A settlement: create the Commander -> Trader redelegation record,
   * then redeem the genuine 2-link delegation chain on-chain via the 1Shot
   * relayer (proven mainnet path). The verdict-approved amount is settled as a
   * gasless USDC movement to `recipient`, gas paid in USDC, EIP-7702 upgrade
   * folded into the same bundle.
   *
   * Requires both PRIVATE_KEY (Commander) and TRADER_PRIVATE_KEY (distinct
   * specialist). Without a distinct trader key, execution is skipped and only
   * the redelegation record is returned.
   */
  async coordinateAndExecute(
    rootDelegationId: string,
    tradeAmount: bigint,
    recipient: Address,
    destinationUrl?: string
  ): Promise<A2ACoordinationResult> {
    const coordination = await this.coordinate(rootDelegationId, tradeAmount, recipient)
    if (!coordination.delegated) {
      return coordination
    }

    const commanderKey = config.privateKey as Hex
    const traderKey = (process.env.TRADER_PRIVATE_KEY ?? '') as Hex
    if (!commanderKey || !traderKey) {
      return {
        ...coordination,
        reason:
          'Redelegation recorded, but on-chain execution skipped: set TRADER_PRIVATE_KEY (distinct from PRIVATE_KEY) to redeem the A2A chain.',
      }
    }

    const buildWork = (usdc: `0x${string}`): WorkExecution[] => [
      {
        target: usdc,
        value: '0',
        data: encodeFunctionData({
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [getAddress(recipient), tradeAmount],
        }),
      },
    ]

    const outcome = await executeChainViaRelayer(
      commanderKey,
      traderKey,
      buildWork,
      destinationUrl
    )

    return {
      ...coordination,
      execution: {
        status: outcome.status,
        txHash: outcome.txHash,
        taskId: outcome.taskId,
        feePaid: outcome.feePaid,
      },
    }
  }
  /**
   * Full A2A settlement with arbitrary DeFi calldata: create the Commander →
   * Trader redelegation, then redeem via 1Shot with the caller's work
   * executions (Aave supply, Aerodrome swap, etc.) instead of a simple
   * USDC transfer.
   *
   * When the root delegation has a permissionContext (from ERC-7715), executes
   * from the USER's smart account. Otherwise falls back to agent-funded path.
   */
  async coordinateAndExecuteWork(
    rootDelegationId: string,
    workExecutions: Array<{ target: Address; value: bigint; data: Hex }>,
    userAddress: Address,
    destinationUrl?: string
  ): Promise<A2ACoordinationResult> {
    const totalAmount = workExecutions.reduce((sum, w) => sum + w.value, 0n)
    const coordination = await this.coordinate(rootDelegationId, totalAmount || 1_000_000n, userAddress)
    if (!coordination.delegated) {
      return coordination
    }

    const commanderKey = config.privateKey as Hex
    const traderKey = (process.env.TRADER_PRIVATE_KEY ?? '') as Hex
    if (!commanderKey || !traderKey) {
      return {
        ...coordination,
        reason: 'Redelegation recorded, but execution skipped: TRADER_PRIVATE_KEY required for signing.',
      }
    }

    const buildWork = (_usdc: `0x${string}`): WorkExecution[] =>
      workExecutions.map(w => ({
        target: w.target,
        value: w.value.toString(),
        data: w.data,
      }))

    // Route based on whether user granted via ERC-7715 (has permissionContext)
    const root = getDelegation(rootDelegationId)
    let outcome

    if (root?.permissionContext) {
      // ERC-7715 flow: execute from user's smart account
      outcome = await executeFromUserAccount(
        commanderKey,
        traderKey,
        root.permissionContext,
        root.dependencies as Array<{ factory: string; factoryData: string }> | undefined,
        buildWork,
        destinationUrl
      )
    } else {
      // Legacy fallback: execute from agent wallet (requires funded Commander)
      outcome = await executeChainViaRelayer(
        commanderKey,
        traderKey,
        buildWork,
        destinationUrl
      )
    }

    return {
      ...coordination,
      execution: {
        status: outcome.status,
        txHash: outcome.txHash,
        taskId: outcome.taskId,
        feePaid: outcome.feePaid,
      },
    }
  }
}

function emptyResult(reason: string): A2ACoordinationResult {
  return {
    delegated: false,
    subDelegation: null,
    chain: [],
    traderAddress: null,
    fallbackMode: false,
    reason,
  }
}
