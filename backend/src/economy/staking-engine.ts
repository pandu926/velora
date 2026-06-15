import { prisma } from '../db/client.js'

export type StakeLevel = 'none' | 'low' | 'high' | 'all_in'

interface StakeConfig {
  amount: number
  rewardCorrect: number
  penaltyWrong: number
}

const STAKE_CONFIGS: Record<StakeLevel, StakeConfig> = {
  none: { amount: 0, rewardCorrect: 0, penaltyWrong: 0 },
  low: { amount: 10, rewardCorrect: 15, penaltyWrong: -10 },
  high: { amount: 25, rewardCorrect: 40, penaltyWrong: -25 },
  all_in: { amount: 50, rewardCorrect: 80, penaltyWrong: -50 },
}

const MIN_REPUTATION_TO_STAKE = 20

export class StakingEngine {
  getStakeConfig(level: StakeLevel): StakeConfig {
    return STAKE_CONFIGS[level]
  }

  canStake(reputation: number, lockedReputation: number, level: StakeLevel): boolean {
    if (level === 'none') return true
    if (reputation < MIN_REPUTATION_TO_STAKE) return false

    const available = reputation - lockedReputation
    const config = STAKE_CONFIGS[level]
    return available >= config.amount
  }

  async lockStake(agentId: string, level: StakeLevel): Promise<boolean> {
    if (level === 'none') return true

    const agent = await prisma.agent.findUnique({ where: { id: agentId } })
    if (!agent) return false

    if (!this.canStake(agent.reputation, agent.lockedReputation, level)) return false

    const config = STAKE_CONFIGS[level]
    await prisma.agent.update({
      where: { id: agentId },
      data: { lockedReputation: { increment: config.amount } },
    })

    return true
  }

  async resolveStake(
    agentId: string,
    sessionId: string,
    level: StakeLevel,
    wasCorrect: boolean
  ): Promise<number> {
    if (level === 'none') return 0

    const config = STAKE_CONFIGS[level]
    const delta = wasCorrect ? config.rewardCorrect : config.penaltyWrong

    await prisma.$transaction([
      prisma.agent.update({
        where: { id: agentId },
        data: { lockedReputation: { decrement: config.amount } },
      }),
      prisma.reputationEvent.create({
        data: {
          agentId,
          sessionId,
          delta,
          reason: `Stake resolved (${level}): ${wasCorrect ? 'correct' : 'incorrect'}`,
          reputationAfter: 0,
          breakdown: { stakeLevel: level, wasCorrect, reward: config.rewardCorrect, penalty: config.penaltyWrong },
        },
      }),
    ])

    const updated = await prisma.agent.update({
      where: { id: agentId },
      data: { reputation: { increment: delta } },
    })

    await prisma.reputationEvent.updateMany({
      where: { agentId, sessionId, reason: { startsWith: 'Stake resolved' } },
      data: { reputationAfter: Math.max(0, Math.min(100, updated.reputation)) },
    })

    return delta
  }

  buildStakingPrompt(agentReputation: number, lockedReputation: number): string {
    const available = agentReputation - lockedReputation
    const options: string[] = ['NO_STAKE']

    if (available >= 10 && agentReputation >= MIN_REPUTATION_TO_STAKE) options.push('LOW_STAKE(10)')
    if (available >= 25 && agentReputation >= MIN_REPUTATION_TO_STAKE) options.push('HIGH_STAKE(25)')
    if (available >= 50 && agentReputation >= MIN_REPUTATION_TO_STAKE) options.push('ALL_IN(50)')

    return `\nREPUTATION STAKING:
Your reputation: ${agentReputation.toFixed(1)} (locked: ${lockedReputation.toFixed(1)}, available: ${available.toFixed(1)})
You may stake reputation on this vote for higher reward if correct, higher penalty if wrong.
Options: ${options.join(' | ')}
Only stake high when you have STRONG, VERIFIABLE evidence.
Add "stake":"none"|"low"|"high"|"all_in" to your JSON response.`
  }

  parseStakeLevel(raw: string): StakeLevel {
    const normalized = raw.toLowerCase().replace(/[_\s-]/g, '')
    if (normalized.includes('allin')) return 'all_in'
    if (normalized.includes('high')) return 'high'
    if (normalized.includes('low')) return 'low'
    return 'none'
  }
}

export const stakingEngine = new StakingEngine()
