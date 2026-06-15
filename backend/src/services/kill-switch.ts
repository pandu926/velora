import type { Address } from 'viem'
import { getActiveDelegations, revokeDelegation } from './delegation.js'

/**
 * Result of a kill switch activation.
 */
export interface KillSwitchResult {
  success: boolean
  revokedCount: number
  timestamp: number
  error?: string
}

/**
 * In-memory record of kill switch activations.
 * Tracks which addresses have triggered the kill switch.
 */
const killSwitchActivations = new Map<Address, number>()

/**
 * Activates the kill switch: revokes ALL active delegations for the user.
 *
 * By revoking the root delegation (parentDelegationId === null), all
 * sub-delegations in the chain become invalid because the delegation
 * framework validates the full chain from leaf to root.
 *
 * @param userAddress - The user's smart account address
 * @returns Result indicating how many delegations were revoked
 */
export async function revokeAllPermissions(
  userAddress: Address
): Promise<KillSwitchResult> {
  const timestamp = Math.floor(Date.now() / 1000)

  try {
    const activeDelegations = getActiveDelegations(userAddress)

    if (activeDelegations.length === 0) {
      return {
        success: true,
        revokedCount: 0,
        timestamp,
      }
    }

    // Revoke root delegations first — this invalidates the entire tree.
    // Then revoke remaining delegations for explicit cleanup.
    const rootDelegations = activeDelegations.filter(
      (d) => d.parentDelegationId === null
    )
    const childDelegations = activeDelegations.filter(
      (d) => d.parentDelegationId !== null
    )

    let revokedCount = 0

    // Revoke roots first (cascades invalidation to all children)
    for (const delegation of rootDelegations) {
      await revokeDelegation(userAddress, delegation.id)
      revokedCount++
    }

    // Explicitly revoke children for clean state
    for (const delegation of childDelegations) {
      try {
        await revokeDelegation(userAddress, delegation.id)
        revokedCount++
      } catch {
        // Child may already be invalid due to root revocation — continue
      }
    }

    // Record the kill switch activation
    killSwitchActivations.set(userAddress, timestamp)

    return {
      success: true,
      revokedCount,
      timestamp,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      revokedCount: 0,
      timestamp,
      error: message,
    }
  }
}

/**
 * Checks whether the kill switch is currently active for a given address.
 *
 * The kill switch is considered "active" when:
 * 1. The user has triggered it (recorded in activations), AND
 * 2. There are no active delegations remaining
 *
 * @param userAddress - The user's smart account address
 * @returns true if the kill switch has been activated and permissions are revoked
 */
export function isKillSwitchActive(userAddress: Address): boolean {
  const activationTime = killSwitchActivations.get(userAddress)

  if (activationTime === undefined) {
    return false
  }

  // Verify no active delegations remain
  const activeDelegations = getActiveDelegations(userAddress)
  return activeDelegations.length === 0
}

/**
 * Returns the timestamp of the last kill switch activation for an address.
 * Returns undefined if the kill switch has never been activated.
 */
export function getKillSwitchActivationTime(
  userAddress: Address
): number | undefined {
  return killSwitchActivations.get(userAddress)
}

/**
 * Resets the kill switch state for an address.
 * Called when the user re-establishes delegations after a kill switch event.
 */
export function resetKillSwitch(userAddress: Address): void {
  killSwitchActivations.delete(userAddress)
}
