import type { Address } from 'viem'

/**
 * Agent roles in the DeFi Autopilot system.
 * Commander orchestrates; specialists handle specific domains.
 */
export enum AgentRole {
  Commander = 'Commander',
  Scout = 'Scout',
  Trader = 'Trader',
  RiskGuardian = 'RiskGuardian',
}

/**
 * Defines the scope of a single permission grant.
 * Maps to ERC-7715 permission scopes via MetaMask Smart Accounts Kit.
 */
export interface PermissionScope {
  /** The type of permission (e.g., ERC20 transfer, contract call) */
  type: PermissionType
  /** Token contract address the permission applies to */
  tokenAddress: Address
  /** Maximum amount (in token's smallest unit) the delegate can transfer */
  maxAmount: bigint
  /** Contract addresses the delegate is allowed to interact with */
  allowedTargets: readonly Address[]
}

export enum PermissionType {
  Erc20Transfer = 'erc20-transfer',
  Erc20Approve = 'erc20-approve',
  ContractCall = 'contract-call',
}

/**
 * Configuration for a delegation grant to a specific agent role.
 * Defines what each role is allowed to do by default.
 */
export interface DelegationConfig {
  role: AgentRole
  /** Human-readable description of what this delegation allows */
  description: string
  /** Permission scopes granted to this role */
  scopes: readonly PermissionScope[]
  /** Maximum duration in seconds before delegation expires */
  maxDurationSeconds: number
  /** Whether this role can redelegate to sub-agents */
  canRedelegate: boolean
}

/**
 * A signed delegation record stored for tracking and revocation.
 */
export interface DelegationRecord {
  id: string
  delegator: Address
  delegate: Address
  role: AgentRole
  scopes: readonly PermissionScope[]
  signature: `0x${string}`
  createdAt: number
  expiresAt: number
  revoked: boolean
  parentDelegationId: string | null
  /** ERC-7715 permission context returned by requestExecutionPermissions */
  permissionContext?: `0x${string}`
  /** Factory dependencies for account deployment */
  dependencies?: Array<{ factory: Address; factoryData: `0x${string}` }>
  /** DelegationManager contract address */
  delegationManager?: Address
}

/**
 * Default delegation configs per agent role.
 * Commander gets broad access; specialists get narrow, task-specific scopes.
 */
export const DEFAULT_DELEGATION_CONFIGS: Record<AgentRole, Omit<DelegationConfig, 'scopes'>> = {
  [AgentRole.Commander]: {
    role: AgentRole.Commander,
    description: 'Full portfolio management within user-defined limits',
    maxDurationSeconds: 86400 * 7, // 7 days
    canRedelegate: true,
  },
  [AgentRole.Scout]: {
    role: AgentRole.Scout,
    description: 'Read-only market data access, no transaction permissions',
    maxDurationSeconds: 86400 * 30, // 30 days
    canRedelegate: false,
  },
  [AgentRole.Trader]: {
    role: AgentRole.Trader,
    description: 'Execute swaps and provide liquidity within amount limits',
    maxDurationSeconds: 86400, // 24 hours
    canRedelegate: false,
  },
  [AgentRole.RiskGuardian]: {
    role: AgentRole.RiskGuardian,
    description: 'Emergency withdrawal and position closure only',
    maxDurationSeconds: 86400 * 7, // 7 days
    canRedelegate: false,
  },
} as const
