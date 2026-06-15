import { privateKeyToAccount } from 'viem/accounts'
import { createPublicClient, http, type Chain, type Hex } from 'viem'
import { getSmartAccountsEnvironment } from '@metamask/smart-accounts-kit'
import { config, getChain } from '../config/index.js'
import type { RelayerAuthorizationEntry } from './relayer.js'

/**
 * EIP-7702 account upgrade.
 *
 * The 1Shot Permissionless Relayer requires accounts to be upgraded to a
 * stateless delegator smart account via a 7702 authorization. For a
 * server-side agent EOA (not a browser wallet), WE must produce the signed
 * authorization that points the EOA at MetaMask's
 * EIP7702StatelessDeleGatorImpl, then include it in the relayer payload.
 */

/** The 7702 delegation designator prefix written to an upgraded account's code. */
const EIP7702_CODE_PREFIX = '0xef0100'

/** Resolve the EIP-7702 stateless delegator implementation for the active chain. */
export function getStatelessDelegatorAddress(): `0x${string}` {
  const env = getSmartAccountsEnvironment(config.chainId) as unknown as {
    implementations: Record<string, `0x${string}`>
  }
  const addr = env.implementations.EIP7702StatelessDeleGatorImpl
  if (!addr) {
    throw new Error(
      `No EIP7702StatelessDeleGatorImpl in environment for chain ${config.chainId}`
    )
  }
  return addr
}

/**
 * Builds a signed EIP-7702 authorization that upgrades the agent EOA to the
 * stateless delegator. Returns null if the account is already upgraded
 * (its code already carries the 7702 delegation designator), in which case
 * no authorization needs to be sent.
 *
 * @param privateKey - The agent EOA private key to authorize the upgrade
 * @returns Relayer-formatted authorization entry, or null if already upgraded
 */
export async function buildAuthorization(
  privateKey: Hex
): Promise<RelayerAuthorizationEntry | null> {
  const account = privateKeyToAccount(privateKey)
  const publicClient = createPublicClient({
    chain: getChain() as Chain,
    transport: http(config.rpcUrl),
  })

  const delegator = getStatelessDelegatorAddress()

  // If the account is already a 7702 delegator, no upgrade authorization needed.
  const code = await publicClient.getCode({ address: account.address })
  if (code && code.toLowerCase().startsWith(EIP7702_CODE_PREFIX)) {
    return null
  }

  const nonce = await publicClient.getTransactionCount({ address: account.address })

  const authorization = await account.signAuthorization({
    contractAddress: delegator,
    chainId: config.chainId,
    nonce,
  })

  return {
    chainId: String(config.chainId),
    address: delegator,
    nonce: String(nonce),
    yParity: String(authorization.yParity ?? 0),
    r: authorization.r,
    s: authorization.s,
  }
}
