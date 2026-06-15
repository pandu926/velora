import { encodeFunctionData, type Hex } from 'viem'
import { config } from '../config/index.js'

/** Minimal ERC-20 transfer ABI for building the gas-fee payment execution. */
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

// --- Constants ---

/** USDC on Base — default payment token for relayer fees */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
/** USDT on Base — alternative payment token */
export const USDT_BASE = '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2' as const
/** 1Shot relayer target address from capabilities */
export const RELAYER_TARGET = '0x26a529124f0bbf9af9d8f9f84a43efe47cf1199a' as const
/** Fee collector address */
export const FEE_COLLECTOR = '0xE936e8FAf4A5655469182A49a505055B71C17604' as const

// --- Types ---

export interface RelayerCapabilities {
  chainId: string
  supportedTokens: readonly string[]
  targetAddress: string
  maxGasLimit: string
}

export interface FeeData {
  gasPrice: bigint
  rate: bigint
  minFee: bigint
  expiry: number
  token: `0x${string}`
  context: string
}

export interface RelayerExecution {
  target: `0x${string}`
  value: bigint
  callData: Hex
}

export interface RelayerAuthorizationEntry {
  chainId: string
  address: `0x${string}`
  nonce: string
  yParity: string
  r: Hex
  s: Hex
}

export interface SubmitTransactionParams {
  delegation: Hex
  executions: readonly RelayerExecution[]
  feeContext: string
  authorizationList?: readonly RelayerAuthorizationEntry[]
  /** Webhook URL the relayer POSTs status updates to (scores higher per track). */
  destinationUrl?: string
}

export interface SubmitTransactionResult {
  taskId: string
  status: 'pending' | 'submitted' | 'confirmed' | 'failed'
  txHash?: Hex
}

export interface TransactionStatus {
  taskId: string
  status: 'pending' | 'submitted' | 'confirmed' | 'failed'
  txHash?: Hex
  blockNumber?: number
  error?: string
}

// --- JSON-RPC helpers ---

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown
}

interface JsonRpcResponse<T> {
  jsonrpc: '2.0'
  id: number
  result?: T
  error?: { code: number; message: string; data?: unknown }
}

let requestId = 0

function nextRequestId(): number {
  requestId += 1
  return requestId
}

async function rpcCall<T>(method: string, params: unknown): Promise<T> {
  const body: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: nextRequestId(),
    method,
    params,
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (config.oneshotApiKey) {
    headers['Authorization'] = `Bearer ${config.oneshotApiKey}`
  }

  const response = await fetch(config.oneshotRelayerUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(
      `Relayer HTTP error: ${response.status} ${response.statusText}`
    )
  }

  const json = (await response.json()) as JsonRpcResponse<T>

  if (json.error) {
    throw new Error(
      `Relayer RPC error [${json.error.code}]: ${json.error.message}`
    )
  }

  if (json.result === undefined) {
    throw new Error('Relayer returned empty result')
  }

  return json.result
}

// --- Public API ---

/**
 * Fetches the relayer's capabilities for a given chain.
 * Returns supported tokens, target address, and gas limits.
 */
export async function getRelayerCapabilities(
  chainId: string = String(config.chainId)
): Promise<RelayerCapabilities> {
  const result = await rpcCall<RelayerCapabilities>(
    'relayer_getCapabilities',
    [chainId]
  )
  return result
}

/**
 * Fetches fee data for a specific payment token on a chain.
 * Returns gas price, conversion rate, minimum fee, and an expiring fee context.
 */
export async function getFeeData(
  chainId: string = String(config.chainId),
  paymentToken: `0x${string}` = USDC_BASE
): Promise<FeeData> {
  const result = await rpcCall<{
    gasPrice: string
    rate: string
    minFee: string
    expiry: number
    token: `0x${string}`
    context: string
  }>('relayer_getFeeData', { chainId, token: paymentToken })

  return {
    gasPrice: BigInt(result.gasPrice),
    rate: BigInt(result.rate),
    minFee: BigInt(result.minFee),
    expiry: result.expiry,
    token: result.token,
    context: result.context,
  }
}

/**
 * Builds the ERC-20 stablecoin transfer execution that pays the relayer's gas
 * fee. Per 1Shot's model, this transfer must be included as one of the
 * executions in the submitted bundle. The amount comes from the locked fee
 * quote (FeeData.minFee or a computed fee).
 */
export function buildFeeTransferExecution(
  feeAmount: bigint,
  paymentToken: `0x${string}` = USDC_BASE,
  feeCollector: `0x${string}` = FEE_COLLECTOR
): RelayerExecution {
  const callData = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [feeCollector, feeAmount],
  })

  return {
    target: paymentToken,
    value: 0n,
    callData,
  }
}

export interface EstimateResult {
  gasLimit: string
  feeAmount: string
  feeToken: `0x${string}`
  context: string
}

/**
 * Validates a 7710 transaction and estimates the gas fee before submission.
 * Required step per 1Shot docs — returns a fee context to pass to submit.
 */
export async function estimate7710Transaction(params: {
  delegation: Hex
  executions: readonly RelayerExecution[]
  paymentToken?: `0x${string}`
  chainId?: string
}): Promise<EstimateResult> {
  const formattedExecutions = params.executions.map((exec) => ({
    target: exec.target,
    value: String(exec.value),
    callData: exec.callData,
  }))

  const result = await rpcCall<EstimateResult>('relayer_estimate7710Transaction', {
    chainId: params.chainId ?? String(config.chainId),
    delegation: params.delegation,
    executions: formattedExecutions,
    token: params.paymentToken ?? USDC_BASE,
  })

  return result
}

/**
 * Submits a delegated transaction to the relayer for gasless execution.
 * The relayer pays gas and charges the user in the specified payment token.
 */
export async function submitTransaction(
  params: SubmitTransactionParams
): Promise<SubmitTransactionResult> {
  const { delegation, executions, feeContext, authorizationList, destinationUrl } = params

  const formattedExecutions = executions.map((exec) => ({
    target: exec.target,
    value: String(exec.value),
    callData: exec.callData,
  }))

  const rpcParams: Record<string, unknown> = {
    delegation,
    executions: formattedExecutions,
    feeContext,
  }

  if (authorizationList && authorizationList.length > 0) {
    rpcParams.authorizationList = authorizationList
  }

  if (destinationUrl) {
    rpcParams.destinationUrl = destinationUrl
  }

  const result = await rpcCall<SubmitTransactionResult>(
    'relayer_send7710Transaction',
    rpcParams
  )

  return result
}

/**
 * Polls the relayer for the status of a previously submitted transaction.
 */
export async function getTransactionStatus(
  taskId: string
): Promise<TransactionStatus> {
  const result = await rpcCall<TransactionStatus>(
    'relayer_getStatus',
    { taskId }
  )
  return result
}

/**
 * Convenience: submits a transaction and polls until it reaches a terminal state.
 * Returns the final status. Throws if polling exceeds maxAttempts.
 */
export async function submitAndWait(
  params: SubmitTransactionParams,
  pollIntervalMs: number = 2000,
  maxAttempts: number = 30
): Promise<TransactionStatus> {
  const submitResult = await submitTransaction(params)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getTransactionStatus(submitResult.taskId)

    if (status.status === 'confirmed' || status.status === 'failed') {
      return status
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }

  throw new Error(
    `Transaction ${submitResult.taskId} did not reach terminal state after ${maxAttempts} attempts`
  )
}
