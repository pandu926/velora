import { type Address } from 'viem'
import { createDelegation, ScopeType } from '@metamask/smart-accounts-kit'
import type { SmartAccount } from './smart-account.js'
import type { PermissionScope, DelegationRecord } from '../types/permissions.js'
import { AgentRole } from '../types/permissions.js'

/**
 * Result of a redelegation attempt.
 * If redelegation is not supported, falls back to Commander-executes-on-behalf pattern.
 */
export interface RedelegationResult {
  success: boolean
  delegationRecord: DelegationRecord | null
  fallbackMode: boolean
  fallbackReason: string | null
}

/**
 * Validates that the narrowed scope is a proper subset of the parent delegation scope.
 * Prevents privilege escalation via redelegation.
 */
function validateScopeNarrowing(
  parentScopes: readonly PermissionScope[],
  narrowedScope: PermissionScope
): { valid: boolean; reason: string | null } {
  const matchingParent = parentScopes.find(
    (ps) =>
      ps.tokenAddress.toLowerCase() === narrowedScope.tokenAddress.toLowerCase() &&
      ps.type === narrowedScope.type
  )

  if (!matchingParent) {
    return {
      valid: false,
      reason: `No parent scope found for token ${narrowedScope.tokenAddress} with type ${narrowedScope.type}`,
    }
  }

  if (narrowedScope.maxAmount > matchingParent.maxAmount) {
    return {
      valid: false,
      reason: `Narrowed amount ${narrowedScope.maxAmount} exceeds parent limit ${matchingParent.maxAmount}`,
    }
  }

  const parentTargets = new Set(
    matchingParent.allowedTargets.map((t) => t.toLowerCase())
  )
  const invalidTargets = narrowedScope.allowedTargets.filter(
    (t) => !parentTargets.has(t.toLowerCase())
  )

  if (invalidTargets.length > 0) {
    return {
      valid: false,
      reason: `Targets not in parent scope: ${invalidTargets.join(', ')}`,
    }
  }

  return { valid: true, reason: null }
}

/**
 * Redelegates a subset of Commander's permissions to a specialist agent.
 *
 * Redelegation creates a new delegation where:
 * - `from` = Commander (the current delegate, not the original owner)
 * - `to` = Specialist agent address
 * - scope is strictly narrower than the parent delegation
 *
 * If the SDK does not support chained redelegation, falls back to the
 * Commander-executes-on-behalf pattern where Commander holds all permissions
 * and executes transactions for specialists internally.
 *
 * @param commanderAccount - Commander's smart account (the current delegate)
 * @param specialistAddress - Target specialist agent address
 * @param parentDelegation - The delegation Commander received from the user
 * @param narrowedScope - Narrower permission scope for the specialist
 * @returns RedelegationResult with delegation or fallback info
 */
export async function redelegateToSpecialist(
  commanderAccount: SmartAccount,
  specialistAddress: Address,
  parentDelegation: DelegationRecord,
  narrowedScope: PermissionScope
): Promise<RedelegationResult> {
  // Validate that narrowed scope is a proper subset of parent
  const validation = validateScopeNarrowing(parentDelegation.scopes, narrowedScope)

  if (!validation.valid) {
    throw new Error(`Scope narrowing validation failed: ${validation.reason}`)
  }

  try {
    // Attempt redelegation: Commander creates a sub-delegation to specialist
    const subDelegation = createDelegation({
      to: specialistAddress,
      from: commanderAccount.address,
      environment: commanderAccount.environment,
      scope: {
        type: ScopeType.Erc20TransferAmount,
        tokenAddress: narrowedScope.tokenAddress,
        maxAmount: narrowedScope.maxAmount,
      },
    })

    // Sign the sub-delegation with Commander's account
    const signature = await commanderAccount.signDelegation({
      delegation: subDelegation,
    })

    const now = Math.floor(Date.now() / 1000)
    const record: DelegationRecord = {
      id: generateRedelegationId(commanderAccount.address, specialistAddress, now),
      delegator: commanderAccount.address,
      delegate: specialistAddress,
      role: inferSpecialistRole(narrowedScope),
      scopes: [narrowedScope],
      signature,
      createdAt: now,
      expiresAt: Math.min(now + 86400, parentDelegation.expiresAt), // 24h or parent expiry
      revoked: false,
      parentDelegationId: parentDelegation.id,
    }

    return {
      success: true,
      delegationRecord: record,
      fallbackMode: false,
      fallbackReason: null,
    }
  } catch (error: unknown) {
    // Fallback: If redelegation is not supported by the SDK or fails,
    // Commander retains all permissions and executes on behalf of specialists.
    // This is the "Commander-as-proxy" pattern where specialist agents send
    // execution requests to Commander, who validates them against the narrowed
    // scope and executes using its own delegation from the user.
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    return {
      success: false,
      delegationRecord: null,
      fallbackMode: true,
      fallbackReason:
        `Redelegation not supported or failed: ${errorMessage}. ` +
        'Falling back to Commander-executes-on-behalf pattern. ' +
        'Commander will validate specialist requests against narrowed scopes ' +
        'and execute transactions using its own delegation from the user.',
    }
  }
}

/**
 * Fallback execution: Commander executes a transaction on behalf of a specialist.
 * Used when direct redelegation is not supported.
 *
 * The Commander validates the request against the specialist's intended scope
 * before executing with its own delegation.
 *
 * @param commanderAccount - Commander's smart account
 * @param specialistRole - The role of the requesting specialist
 * @param intendedScope - The scope the specialist would have had via redelegation
 * @param executionRequest - The transaction the specialist wants to execute
 */
export async function executeOnBehalfOfSpecialist(
  commanderAccount: SmartAccount,
  specialistRole: AgentRole,
  intendedScope: PermissionScope,
  executionRequest: {
    target: Address
    value: bigint
    data: `0x${string}`
  }
): Promise<{ executed: boolean; reason: string | null }> {
  // Validate the execution request against the specialist's intended scope
  if (!intendedScope.allowedTargets.some(
    (t) => t.toLowerCase() === executionRequest.target.toLowerCase()
  )) {
    return {
      executed: false,
      reason: `Target ${executionRequest.target} not in specialist's allowed targets`,
    }
  }

  // In production: use sendUserOperationWithDelegation to execute
  // For now, return success indicating the validation passed
  // The actual execution will be wired in the agent orchestration phase
  return {
    executed: true,
    reason: null,
  }
}

function inferSpecialistRole(scope: PermissionScope): AgentRole {
  if (scope.allowedTargets.length === 0) {
    return AgentRole.Scout
  }
  return AgentRole.Trader
}

function generateRedelegationId(
  commander: Address,
  specialist: Address,
  timestamp: number
): string {
  return `redel_${commander.slice(2, 10)}_${specialist.slice(2, 10)}_${timestamp}`
}
