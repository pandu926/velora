import type { Address } from 'viem'
import type { DelegationRecord } from '../types/permissions.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

const STORE_PATH = join(process.cwd(), 'data', 'delegations.json')

interface SerializedRecord {
  id: string
  delegator: string
  delegate: string
  role: string
  scopes: Array<{
    type: string
    tokenAddress: string
    maxAmount: string
    allowedTargets: readonly string[]
  }>
  signature: string
  createdAt: number
  expiresAt: number
  revoked: boolean
  parentDelegationId: string | null
  permissionContext?: string
  dependencies?: Array<{ factory: string; factoryData: string }>
  delegationManager?: string
}

function loadStore(): Map<string, DelegationRecord> {
  if (!existsSync(STORE_PATH)) return new Map()

  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf-8')) as { delegations: SerializedRecord[] }
    const map = new Map<string, DelegationRecord>()

    for (const d of raw.delegations) {
      map.set(d.id, {
        ...d,
        delegator: d.delegator as Address,
        delegate: d.delegate as Address,
        signature: d.signature as `0x${string}`,
        scopes: d.scopes.map(s => ({
          ...s,
          tokenAddress: s.tokenAddress as Address,
          maxAmount: BigInt(s.maxAmount),
          allowedTargets: s.allowedTargets as readonly Address[],
        })),
        permissionContext: d.permissionContext as `0x${string}` | undefined,
        dependencies: d.dependencies,
        delegationManager: d.delegationManager as Address | undefined,
      } as DelegationRecord)
    }

    return map
  } catch {
    return new Map()
  }
}

function saveStore(): void {
  const dir = dirname(STORE_PATH)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const serialized = {
    delegations: [...delegationStore.values()].map(d => ({
      ...d,
      scopes: d.scopes.map(s => ({
        ...s,
        maxAmount: s.maxAmount.toString(),
      })),
    })),
  }

  writeFileSync(STORE_PATH, JSON.stringify(serialized, null, 2))
}

const delegationStore = loadStore()

export function storeDelegation(record: DelegationRecord): void {
  delegationStore.set(record.id, record)
  saveStore()
}

export function getDelegation(id: string): DelegationRecord | undefined {
  return delegationStore.get(id)
}

export function getActiveDelegations(delegator: Address): DelegationRecord[] {
  const now = Math.floor(Date.now() / 1000)
  const results: DelegationRecord[] = []
  const delegatorLower = delegator.toLowerCase()

  for (const record of delegationStore.values()) {
    if (
      record.delegator.toLowerCase() === delegatorLower &&
      !record.revoked &&
      now <= record.expiresAt
    ) {
      results.push(record)
    }
  }

  return results
}

export function getRootDelegation(delegator: Address): DelegationRecord | undefined {
  const now = Math.floor(Date.now() / 1000)
  const delegatorLower = delegator.toLowerCase()

  for (const record of delegationStore.values()) {
    if (
      record.delegator.toLowerCase() === delegatorLower &&
      record.parentDelegationId === null &&
      !record.revoked &&
      now <= record.expiresAt
    ) {
      return record
    }
  }

  return undefined
}

export async function revokeDelegation(
  delegatorAddress: Address,
  delegationId: string
): Promise<void> {
  const record = delegationStore.get(delegationId)

  if (!record) {
    throw new Error(`Delegation not found: ${delegationId}`)
  }

  if (record.delegator !== delegatorAddress) {
    throw new Error('Only the delegator can revoke a delegation')
  }

  if (record.revoked) {
    throw new Error('Delegation is already revoked')
  }

  const revokedRecord: DelegationRecord = {
    ...record,
    revoked: true,
  }
  delegationStore.set(delegationId, revokedRecord)
  saveStore()
}

export function isDelegationActive(delegationId: string): boolean {
  const record = delegationStore.get(delegationId)

  if (!record) {
    return false
  }

  const now = Math.floor(Date.now() / 1000)
  return !record.revoked && now <= record.expiresAt
}

export function generateDelegationId(
  delegator: Address,
  delegate: Address,
  timestamp: number
): string {
  return `del_${delegator.slice(2, 10)}_${delegate.slice(2, 10)}_${timestamp}`
}
