import { prisma } from '../db/client.js'
import { createPublicClient, createWalletClient, http, type Address, encodeFunctionData } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { config } from '../config/index.js'

const VELORA_REPUTATION_ABI = [
  {
    name: 'batchUpdateReputations',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIds', type: 'uint256[]' },
      { name: 'reputations', type: 'uint8[]' },
      { name: 'accuracies', type: 'uint16[]' },
      { name: 'sessions', type: 'uint32[]' },
    ],
    outputs: [],
  },
  {
    name: 'mintAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'instance', type: 'address' },
      { name: 'role', type: 'string' },
      { name: 'model', type: 'string' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

interface SyncResult {
  agentsSynced: number
  txHash: string | null
  dryRun: boolean
  agents: Array<{ id: string; reputation: number; accuracy: number; sessions: number }>
}

export class OnChainSyncService {
  private contractAddress: Address | null
  private rpcUrl: string

  constructor() {
    this.contractAddress = (process.env.VELORA_REPUTATION_CONTRACT as Address) || null
    this.rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org'
  }

  async prepareSync(): Promise<SyncResult> {
    const agents = await prisma.agent.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    })

    const syncData = agents.map((a, idx) => ({
      id: a.id,
      tokenId: idx,
      reputation: Math.round(Math.max(0, Math.min(100, a.reputation))),
      accuracy: Math.round(a.accuracy * 10000),
      sessions: a.totalSessions,
    }))

    if (!this.contractAddress || !config.privateKey) {
      return {
        agentsSynced: syncData.length,
        txHash: null,
        dryRun: true,
        agents: syncData.map(a => ({ id: a.id, reputation: a.reputation, accuracy: a.accuracy / 100, sessions: a.sessions })),
      }
    }

    const account = privateKeyToAccount(config.privateKey as `0x${string}`)
    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(this.rpcUrl),
    })

    const tokenIds = syncData.map(a => BigInt(a.tokenId))
    const reputations = syncData.map(a => a.reputation)
    const accuracies = syncData.map(a => a.accuracy)
    const sessions = syncData.map(a => a.sessions)

    const txHash = await walletClient.writeContract({
      address: this.contractAddress,
      abi: VELORA_REPUTATION_ABI,
      functionName: 'batchUpdateReputations',
      args: [tokenIds, reputations, accuracies, sessions],
    })

    return {
      agentsSynced: syncData.length,
      txHash,
      dryRun: false,
      agents: syncData.map(a => ({ id: a.id, reputation: a.reputation, accuracy: a.accuracy / 100, sessions: a.sessions })),
    }
  }

  async getLastSyncTime(): Promise<Date | null> {
    if (!this.contractAddress) return null

    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(this.rpcUrl),
      })

      const events = await publicClient.getContractEvents({
        address: this.contractAddress,
        abi: [{ name: 'ReputationUpdated', type: 'event', inputs: [{ name: 'tokenId', type: 'uint256', indexed: true }, { name: 'reputation', type: 'uint8' }, { name: 'accuracyBps', type: 'uint16' }, { name: 'totalSessions', type: 'uint32' }] }],
        fromBlock: 'earliest',
      })

      if (events.length === 0) return null
      return new Date(Number(events[events.length - 1]!.blockNumber) * 1000)
    } catch {
      return null
    }
  }

  isConfigured(): boolean {
    return this.contractAddress !== null && config.privateKey !== undefined
  }
}

export const onChainSyncService = new OnChainSyncService()
