import { randomBytes } from 'node:crypto'
import {
  Implementation,
  ScopeType,
  createDelegation,
  toMetaMaskSmartAccount,
} from '@metamask/smart-accounts-kit'
import {
  createPublicClient,
  http,
  getAddress,
  encodeFunctionData,
  type Chain,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { bytesToHex } from 'viem/utils'
import { config, getChain } from '../config/index.js'

/**
 * Production 1Shot relayer executor.
 *
 * This is the exact flow proven to produce a confirmed on-chain transaction
 * on Base mainnet (tx 0x81f07f...): build a signed delegation whose delegate
 * is the relayer's targetAddress, embed a USDC fee transfer + work executions,
 * attach an EIP-7702 authorization, estimate (free), then send and poll.
 */

const RELAYER_URL = config.oneshotRelayerUrl

/** Recursively convert bigints / Uint8Arrays to JSON-RPC-safe hex. */
function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return `0x${value.toString(16)}`
  if (value instanceof Uint8Array) return bytesToHex(value)
  if (Array.isArray(value)) return value.map(toRelayerJson)
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = toRelayerJson(v)
    return out
  }
  return value
}

interface JsonRpcResponse<T> {
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

async function rpc<T>(method: string, params: unknown, id = 1): Promise<T> {
  const res = await fetch(RELAYER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })
  const json = (await res.json()) as JsonRpcResponse<T>
  if (json.error) {
    throw new Error(`Relayer RPC [${json.error.code}]: ${json.error.message}`)
  }
  if (json.result === undefined) throw new Error('Relayer returned empty result')
  return json.result
}

interface ChainCapabilities {
  feeCollector: `0x${string}`
  targetAddress: `0x${string}`
  tokens: Array<{ address: `0x${string}`; symbol?: string; decimals: number | string }>
}

interface EstimateResult {
  success: boolean
  requiredPaymentAmount?: string
  context?: string
  gasUsed?: Record<string, string>
  error?: string
}

/** Status codes per relayer spec: 100 pending, 110 submitted, 200 confirmed, 400 rejected, 500 reverted. */
export interface RelayStatus {
  id: `0x${string}`
  status: 100 | 110 | 200 | 400 | 500
  hash?: `0x${string}`
  receipt?: { transactionHash?: `0x${string}`; blockNumber?: number }
  message?: string
  data?: unknown
}

/** A single on-chain action the relayer should execute on the user's behalf. */
export interface WorkExecution {
  target: `0x${string}`
  value: string
  data: `0x${string}`
}

export interface RelayOutcome {
  taskId: `0x${string}`
  status: 'confirmed' | 'rejected' | 'reverted' | 'timeout'
  txHash?: `0x${string}`
  feePaid?: string
}

/** Floor at the relayer's mock fee; the relayer rejects payment below minFee. */
const MOCK_FEE = 10000n // 0.01 USDC (6 decimals)
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
 * Execute work executions gaslessly via the 1Shot relayer, paying gas in USDC
 * and upgrading the agent EOA via EIP-7702 in the same bundle.
 *
 * @param privateKey - The delegator/agent EOA key (signs the delegation + 7702 auth)
 * @param buildWork - Given the resolved USDC token address, return the work executions
 * @param destinationUrl - Optional webhook URL for status events
 */
export async function executeViaRelayer(
  privateKey: Hex,
  buildWork: (usdc: `0x${string}`) => WorkExecution[],
  destinationUrl?: string
): Promise<RelayOutcome> {
  const account = privateKeyToAccount(privateKey)
  const publicClient = createPublicClient({
    chain: getChain() as Chain,
    transport: http(config.rpcUrl),
  })

  const caps = await rpc<Record<string, ChainCapabilities>>('relayer_getCapabilities', [
    String(config.chainId),
  ])
  const chainCaps = caps[String(config.chainId)]
  if (!chainCaps) throw new Error(`Relayer has no capabilities for chain ${config.chainId}`)
  const usdc = chainCaps.tokens.find((t) => t.symbol === 'USDC')
  if (!usdc) throw new Error('Relayer does not support USDC on this chain')

  const smartAccount = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Stateless7702,
    address: account.address,
    signer: { account },
  })

  // EIP-7702 authorization (idempotent: harmless if already upgraded)
  const impl = smartAccount.environment.implementations.EIP7702StatelessDeleGatorImpl
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  })
  const auth = await account.signAuthorization({
    chainId: config.chainId,
    contractAddress: getAddress(impl),
    nonce,
  })
  const authorizationList = [
    {
      address: auth.address,
      chainId: auth.chainId,
      nonce: auth.nonce,
      r: auth.r,
      s: auth.s,
      yParity: auth.yParity ?? 0,
    },
  ]

  const work = buildWork(usdc.address)

  const buildParams = async (feeAmount: bigint) => {
    const delegation = createDelegation({
      to: chainCaps.targetAddress,
      from: smartAccount.address,
      environment: smartAccount.environment,
      salt: bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`,
      scope: {
        type: ScopeType.Erc20TransferAmount,
        tokenAddress: usdc.address,
        maxAmount: feeAmount + MOCK_FEE + 1_000_000n, // headroom for work transfers
      },
    })
    const signature = await smartAccount.signDelegation({ delegation })
    const feeExecution: WorkExecution = {
      target: usdc.address,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [chainCaps.feeCollector, feeAmount],
      }),
    }
    return {
      chainId: String(config.chainId),
      authorizationList: toRelayerJson(authorizationList),
      transactions: [
        {
          permissionContext: [toRelayerJson({ ...delegation, signature })],
          executions: [feeExecution, ...work],
        },
      ],
    }
  }

  return runRelayFlow(buildParams, destinationUrl)
}

/**
 * Execute work through a genuine 2-link A2A delegation chain, redeemed by the
 * 1Shot relayer in a single transaction.
 *
 *   Commander (funded, holds USDC)  --link1-->  Trader (distinct A2A party)
 *   Trader                          --link2-->  relayer targetAddress
 *
 * link2.authority = hash(link1), so the relayer redeems the full chain. This is
 * the unified A2A + 1Shot path proven on Base mainnet (tx 0x10cfd4...): two
 * distinct signers, two signatures, one on-chain redemption, gas paid in USDC,
 * EIP-7702 upgrade in the same bundle.
 *
 * @param commanderKey - Root delegator key; the funded account that holds USDC
 * @param traderKey - Distinct specialist key (the A2A counterparty)
 * @param buildWork - Given the USDC address, return the work executions
 * @param destinationUrl - Optional webhook URL for status events
 */
export async function executeChainViaRelayer(
  commanderKey: Hex,
  traderKey: Hex,
  buildWork: (usdc: `0x${string}`) => WorkExecution[],
  destinationUrl?: string
): Promise<RelayOutcome & { chain: string[]; commander: `0x${string}`; trader: `0x${string}` }> {
  const commander = privateKeyToAccount(commanderKey)
  const trader = privateKeyToAccount(traderKey)
  const publicClient = createPublicClient({
    chain: getChain() as Chain,
    transport: http(config.rpcUrl),
  })

  const caps = await rpc<Record<string, ChainCapabilities>>('relayer_getCapabilities', [
    String(config.chainId),
  ])
  const chainCaps = caps[String(config.chainId)]
  if (!chainCaps) throw new Error(`Relayer has no capabilities for chain ${config.chainId}`)
  const usdc = chainCaps.tokens.find((t) => t.symbol === 'USDC')
  if (!usdc) throw new Error('Relayer does not support USDC on this chain')

  const commanderSA = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Stateless7702,
    address: commander.address,
    signer: { account: commander },
  })
  const traderSA = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Stateless7702,
    address: trader.address,
    signer: { account: trader },
  })
  const env = commanderSA.environment

  // 7702 authorization for the root (executing) account = Commander.
  const impl = env.implementations.EIP7702StatelessDeleGatorImpl
  const nonce = await publicClient.getTransactionCount({
    address: commander.address,
    blockTag: 'pending',
  })
  const auth = await commander.signAuthorization({
    chainId: config.chainId,
    contractAddress: getAddress(impl),
    nonce,
  })
  const authorizationList = [
    { address: auth.address, chainId: auth.chainId, nonce: auth.nonce, r: auth.r, s: auth.s, yParity: auth.yParity ?? 0 },
  ]

  const work = buildWork(usdc.address)
  const chainIds: string[] = []

  const buildParams = async (feeAmount: bigint) => {
    // LINK 1: Commander -> Trader (scoped to fee + work headroom)
    const link1 = createDelegation({
      to: trader.address,
      from: commanderSA.address,
      environment: env,
      salt: bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`,
      scope: {
        type: ScopeType.Erc20TransferAmount,
        tokenAddress: usdc.address,
        maxAmount: feeAmount + MOCK_FEE + 1_000_000n,
      },
    })
    link1.signature = await commanderSA.signDelegation({ delegation: link1 })

    // LINK 2: Trader -> relayer target, authority chained to link1.
    const link2 = createDelegation({
      to: chainCaps.targetAddress,
      from: traderSA.address,
      environment: env,
      salt: bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`,
      parentDelegation: link1,
    })
    link2.signature = await traderSA.signDelegation({ delegation: link2 })

    chainIds.length = 0
    chainIds.push(String(link1.authority), String(link2.authority))

    const feeExecution: WorkExecution = {
      target: usdc.address,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [chainCaps.feeCollector, feeAmount],
      }),
    }
    return {
      chainId: String(config.chainId),
      authorizationList: toRelayerJson(authorizationList),
      transactions: [
        {
          // leaf -> root order: first delegation's delegate must be the target.
          permissionContext: [toRelayerJson(link2), toRelayerJson(link1)],
          executions: [feeExecution, ...work],
        },
      ],
    }
  }

  const outcome = await runRelayFlow(buildParams, destinationUrl)
  return {
    ...outcome,
    commander: commander.address,
    trader: trader.address,
    chain: [`${commander.address}->${trader.address}`, `${trader.address}->${chainCaps.targetAddress}`],
  }
}

/**
 * Execute from the USER's smart account via ERC-7710 delegation redemption.
 *
 * The user's ERC-7715 permissionContext (signed by their wallet in MetaMask)
 * is the root of the delegation chain. Commander and Trader sign intermediate
 * links. No 7702 authorization needed from the backend — user account
 * deployment is handled via dependencies from the ERC-7715 response.
 *
 * Chain: User (permissionContext) → Commander → Trader → relayer target
 * Funds: pulled from user's smart account USDC, not agent wallets.
 */
export async function executeFromUserAccount(
  commanderKey: Hex,
  traderKey: Hex,
  userPermissionContext: Hex,
  userDependencies: Array<{ factory: string; factoryData: string }> | undefined,
  buildWork: (usdc: `0x${string}`) => WorkExecution[],
  destinationUrl?: string
): Promise<RelayOutcome> {
  const commander = privateKeyToAccount(commanderKey)
  const trader = privateKeyToAccount(traderKey)
  const publicClient = createPublicClient({
    chain: getChain() as Chain,
    transport: http(config.rpcUrl),
  })

  const caps = await rpc<Record<string, ChainCapabilities>>('relayer_getCapabilities', [
    String(config.chainId),
  ])
  const chainCaps = caps[String(config.chainId)]
  if (!chainCaps) throw new Error(`Relayer has no capabilities for chain ${config.chainId}`)
  const usdc = chainCaps.tokens.find((t) => t.symbol === 'USDC')
  if (!usdc) throw new Error('Relayer does not support USDC on this chain')

  const commanderSA = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Stateless7702,
    address: commander.address,
    signer: { account: commander },
  })
  const traderSA = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Stateless7702,
    address: trader.address,
    signer: { account: trader },
  })
  const env = commanderSA.environment

  const work = buildWork(usdc.address)

  const buildParams = async (feeAmount: bigint) => {
    // LINK 1: Commander → Trader (scoped to fee + work headroom)
    const link1 = createDelegation({
      to: trader.address,
      from: commanderSA.address,
      environment: env,
      salt: bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`,
      scope: {
        type: ScopeType.Erc20TransferAmount,
        tokenAddress: usdc.address,
        maxAmount: feeAmount + MOCK_FEE + 1_000_000n,
      },
    })
    link1.signature = await commanderSA.signDelegation({ delegation: link1 })

    // LINK 2: Trader → relayer target, authority chained to link1
    const link2 = createDelegation({
      to: chainCaps.targetAddress,
      from: traderSA.address,
      environment: env,
      salt: bytesToHex(Uint8Array.from(randomBytes(32))) as `0x${string}`,
      parentDelegation: link1,
    })
    link2.signature = await traderSA.signDelegation({ delegation: link2 })

    const feeExecution: WorkExecution = {
      target: usdc.address,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [chainCaps.feeCollector, feeAmount],
      }),
    }

    return {
      chainId: String(config.chainId),
      // No authorizationList — user account deployment via dependencies
      ...(userDependencies?.length ? { dependencies: userDependencies } : {}),
      transactions: [
        {
          // Leaf → root: [traderLink, commanderLink, userPermissionContext]
          permissionContext: [toRelayerJson(link2), toRelayerJson(link1), userPermissionContext],
          executions: [feeExecution, ...work],
        },
      ],
    }
  }

  return runRelayFlow(buildParams, destinationUrl)
}

/**
 * Execute directly from user's smart account via ERC-7715 permissionContext.
 *
 * Simplest path: user delegated directly to 1Shot's targetAddress via
 * requestExecutionPermissions. No agent keys sign anything. No authorizationList
 * (MetaMask handled 7702 upgrade). permissionContext is passed as-is.
 *
 * Flow: user's permissionContext → fee + work executions → 1Shot redeems on-chain.
 */
export async function executeDirectViaRelayer(
  userPermissionContext: Hex,
  buildWork: (usdc: `0x${string}`) => WorkExecution[],
  destinationUrl?: string,
  delegationManager?: string
): Promise<RelayOutcome> {
  const caps = await rpc<Record<string, ChainCapabilities>>('relayer_getCapabilities', [
    String(config.chainId),
  ])
  const chainCaps = caps[String(config.chainId)]
  if (!chainCaps) throw new Error(`Relayer has no capabilities for chain ${config.chainId}`)
  const usdc = chainCaps.tokens.find((t) => t.symbol === 'USDC')
  if (!usdc) throw new Error('Relayer does not support USDC on this chain')

  const work = buildWork(usdc.address)

  // Decode the ABI-encoded permissionContext into delegation objects for relayer
  const decodedDelegations = decodeDelegationsFromHex(userPermissionContext)
  console.log('[executeDirectViaRelayer] decoded delegations:', decodedDelegations.length)

  const buildParams = async (feeAmount: bigint) => {
    const feeExecution: WorkExecution = {
      target: usdc.address,
      value: '0',
      data: encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [chainCaps.feeCollector, feeAmount],
      }),
    }

    const allExecutions = [feeExecution, ...work]

    return {
      chainId: String(config.chainId),
      transactions: [
        {
          permissionContext: decodedDelegations.map(d => toRelayerJson(d)),
          executions: allExecutions,
        },
      ],
    }
  }

  return runRelayFlow(buildParams, destinationUrl)
}

function decodeDelegationsFromHex(hex: Hex): Array<Record<string, unknown>> {
  const { decodeAbiParameters } = require('viem') as typeof import('viem')
  const delegationType = [{
    type: 'tuple[]',
    components: [
      { name: 'delegate', type: 'address' },
      { name: 'delegator', type: 'address' },
      { name: 'authority', type: 'bytes32' },
      { name: 'caveats', type: 'tuple[]', components: [
        { name: 'enforcer', type: 'address' },
        { name: 'terms', type: 'bytes' },
      ]},
      { name: 'salt', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ]
  }] as const

  const [delegations] = decodeAbiParameters(delegationType, hex)
  return delegations.map(d => ({
    delegate: d.delegate,
    delegator: d.delegator,
    authority: d.authority,
    caveats: d.caveats.map(c => ({ enforcer: c.enforcer, terms: c.terms, args: '0x' })),
    salt: '0x' + BigInt(d.salt).toString(16),
    signature: d.signature,
  }))
}

/**
 * Shared estimate -> (re-estimate on fee delta) -> send -> poll loop.
 * Estimate is free (no funds moved); it validates the bundle and locks a quote.
 */
async function runRelayFlow(
  buildParams: (feeAmount: bigint) => Promise<Record<string, unknown>>,
  destinationUrl?: string
): Promise<RelayOutcome> {
  let params = await buildParams(MOCK_FEE)
  console.log('[runRelayFlow] estimate params:', JSON.stringify(params, (k,v) => typeof v === 'bigint' ? `0x${v.toString(16)}` : v).slice(0, 800))
  let estimate = await rpc<EstimateResult>('relayer_estimate7710Transaction', params, 0)
  console.log('[runRelayFlow] estimate result:', JSON.stringify(estimate).slice(0, 300))
  if (!estimate.success) throw new Error(`Estimate failed: ${estimate.error ?? 'unknown'}`)

  const requiredFee = BigInt(estimate.requiredPaymentAmount ?? String(MOCK_FEE))
  if (requiredFee !== MOCK_FEE) {
    params = await buildParams(requiredFee)
    estimate = await rpc<EstimateResult>('relayer_estimate7710Transaction', params, 0)
    if (!estimate.success) throw new Error(`Re-estimate failed: ${estimate.error ?? 'unknown'}`)
  }

  const taskId = await rpc<`0x${string}`>('relayer_send7710Transaction', {
    ...params,
    context: estimate.context,
    ...(destinationUrl ? { destinationUrl } : {}),
  })

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const st = await rpc<RelayStatus>('relayer_getStatus', { id: taskId, logs: false })
    if (st.status === 200) {
      return {
        taskId,
        status: 'confirmed',
        txHash: st.hash ?? st.receipt?.transactionHash,
        feePaid: estimate.requiredPaymentAmount,
      }
    }
    if (st.status === 400) return { taskId, status: 'rejected', feePaid: estimate.requiredPaymentAmount }
    if (st.status === 500) return { taskId, status: 'reverted', feePaid: estimate.requiredPaymentAmount }
  }
  return { taskId, status: 'timeout' }
}
