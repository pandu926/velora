import { Router, type Request, type Response } from 'express'
import { isAddress, type Address, type Hex } from 'viem'
import { createSmartAccount } from '../services/smart-account.js'
import {
  storeDelegation,
  getActiveDelegations,
  getRootDelegation,
  revokeDelegation,
  generateDelegationId,
} from '../services/delegation.js'
import {
  AgentRole,
  PermissionType,
  DEFAULT_DELEGATION_CONFIGS,
  type DelegationRecord,
  type PermissionScope,
} from '../types/permissions.js'
import { config } from '../config/index.js'

const delegateRouter: Router = Router()

/** USDC + WETH on Base mainnet — the assets the agent may manage. */
const USDC: Address = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const WETH: Address = '0x4200000000000000000000000000000000000006'
const AAVE_POOL: Address = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
const AERODROME_ROUTER: Address = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43'

/** Default root scopes granted by the user to the Commander agent. */
function buildRootScopes(maxUsdc: bigint): readonly PermissionScope[] {
  return [
    {
      type: PermissionType.Erc20Transfer,
      tokenAddress: USDC,
      maxAmount: maxUsdc,
      allowedTargets: [USDC, WETH, AAVE_POOL, AERODROME_ROUTER],
    },
  ]
}

/**
 * GET /api/delegate/target-address
 * Returns the 1Shot relayer targetAddress — the address users delegate to via ERC-7715.
 * No agent private key needed. 1Shot is the delegate that redeems on-chain.
 */
delegateRouter.get('/target-address', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(config.oneshotRelayerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'relayer_getCapabilities', params: [String(config.chainId)] }),
    })
    const json = await response.json() as { result?: Record<string, { targetAddress: string }> }
    const chainCaps = json.result?.[String(config.chainId)]
    if (!chainCaps?.targetAddress) {
      return res.status(500).json({ success: false, error: 'Relayer did not return targetAddress' })
    }
    return res.json({ targetAddress: chainCaps.targetAddress })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch relayer capabilities'
    return res.status(500).json({ success: false, error: message })
  }
})

/**
 * GET /api/delegate/commander-address
 * Returns the Commander smart account address (derived from PRIVATE_KEY).
 * Legacy — kept for backward compatibility.
 */
delegateRouter.get('/commander-address', async (_req: Request, res: Response) => {
  if (!config.privateKey) {
    return res.status(500).json({ success: false, error: 'Agent wallet not configured' })
  }
  try {
    const commander = await createSmartAccount(config.privateKey as Hex)
    return res.json({ commanderAddress: commander.address })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to derive commander address'
    return res.status(500).json({ success: false, error: message })
  }
})

/**
 * POST /api/delegate
 * User grants scoped portfolio-management permission to the Commander agent.
 *
 * The Commander smart account is created server-side. The root delegation
 * (user -> Commander) is anchored as a record with a narrow ERC-20 scope.
 * The returned commanderAddress + delegationId drive the downstream
 * court-gated redelegation to the Trader specialist.
 */
delegateRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as {
    userAddress?: unknown
    maxUsdc?: unknown
    signature?: unknown
    expiry?: unknown
    permissionContext?: unknown
    dependencies?: unknown
    delegationManager?: unknown
  }

  if (typeof body.userAddress !== 'string' || !isAddress(body.userAddress)) {
    return res
      .status(400)
      .json({ success: false, error: 'userAddress must be a valid EVM address' })
  }

  if (!config.privateKey) {
    return res
      .status(500)
      .json({ success: false, error: 'Agent wallet not configured (PRIVATE_KEY missing)' })
  }

  const userAddress = body.userAddress as Address
  const maxUsdc = BigInt(typeof body.maxUsdc === 'string' ? body.maxUsdc : '100000000')
  const userSignature = (typeof body.signature === 'string' ? body.signature : '0x') as Hex
  const clientExpiry =
    typeof body.expiry === 'number' && body.expiry > 0 ? body.expiry : null

  // ERC-7715 fields (present when MetaMask supports requestExecutionPermissions)
  const permissionContext = typeof body.permissionContext === 'string' ? body.permissionContext as Hex : undefined
  const dependencies = Array.isArray(body.dependencies) ? body.dependencies as Array<{ factory: Address; factoryData: Hex }> : undefined
  const delegationManager = typeof body.delegationManager === 'string' ? body.delegationManager as Address : undefined

  try {
    const commander = await createSmartAccount(config.privateKey as Hex)
    const commanderAddress = commander.address

    const now = Math.floor(Date.now() / 1000)
    const commanderCfg = DEFAULT_DELEGATION_CONFIGS[AgentRole.Commander]
    const scopes = buildRootScopes(maxUsdc)

    const record: DelegationRecord = {
      id: generateDelegationId(userAddress, commanderAddress, now),
      delegator: userAddress,
      delegate: commanderAddress,
      role: AgentRole.Commander,
      scopes,
      signature: userSignature,
      createdAt: now,
      expiresAt: clientExpiry ?? now + commanderCfg.maxDurationSeconds,
      revoked: false,
      parentDelegationId: null,
      permissionContext,
      dependencies,
      delegationManager,
    }

    storeDelegation(record)

    return res.json({
      success: true,
      data: {
        delegationId: record.id,
        commanderAddress,
        delegator: userAddress,
        scopes: scopes.map((s) => ({
          type: s.type,
          tokenAddress: s.tokenAddress,
          maxAmount: s.maxAmount.toString(),
          allowedTargets: s.allowedTargets,
        })),
        expiresAt: record.expiresAt,
        canRedelegate: commanderCfg.canRedelegate,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Delegation failed'
    return res.status(500).json({ success: false, error: message })
  }
})

/**
 * GET /api/delegate/:userAddress
 * Returns the active delegation chain for a user (root + any sub-delegations).
 */
delegateRouter.get('/:userAddress', (req: Request, res: Response) => {
  const rawAddress = req.params.userAddress as string
  if (!rawAddress || rawAddress.length !== 42 || !rawAddress.startsWith('0x')) {
    return res.status(400).json({ success: false, error: 'Invalid EVM address' })
  }

  const userAddress = rawAddress as Address
  const root = getRootDelegation(userAddress)
  const active = getActiveDelegations(userAddress)

  return res.json({
    success: true,
    data: {
      root: root ? serializeRecord(root) : null,
      active: active.map(serializeRecord),
    },
  })
})

/**
 * POST /api/delegate/revoke
 * Kill switch: user revokes a delegation by ID.
 */
delegateRouter.post('/revoke', async (req: Request, res: Response) => {
  const body = req.body as { userAddress?: string; delegationId?: string }
  if (!body.userAddress || !isAddress(body.userAddress) || !body.delegationId) {
    return res
      .status(400)
      .json({ success: false, error: 'userAddress and delegationId are required' })
  }

  try {
    await revokeDelegation(body.userAddress as Address, body.delegationId)
    return res.json({ success: true, data: { revoked: body.delegationId } })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Revoke failed'
    return res.status(400).json({ success: false, error: message })
  }
})

function serializeRecord(r: DelegationRecord) {
  return {
    id: r.id,
    delegator: r.delegator,
    delegate: r.delegate,
    role: r.role,
    scopes: r.scopes.map((s) => ({
      type: s.type,
      tokenAddress: s.tokenAddress,
      maxAmount: s.maxAmount.toString(),
      allowedTargets: s.allowedTargets,
    })),
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    revoked: r.revoked,
    parentDelegationId: r.parentDelegationId,
  }
}

export { delegateRouter }
