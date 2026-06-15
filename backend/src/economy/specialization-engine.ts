import { prisma } from '../db/client.js'

const SPECIALIZATION_BONUS_CAP = 0.5
const CROSS_DOMAIN_PENALTY = -0.2
const MIN_SAMPLES_FOR_PENALTY = 5

export class SpecializationEngine {
  async updateSpecialization(agentId: string, domain: string, wasCorrect: boolean): Promise<void> {
    const existing = await prisma.specialization.findUnique({
      where: { agentId_domain: { agentId, domain } },
    })

    if (existing) {
      const newSampleSize = existing.sampleSize + 1
      const newCorrectCount = existing.accuracy * existing.sampleSize + (wasCorrect ? 1 : 0)
      const newAccuracy = newCorrectCount / newSampleSize
      const newConfidence = Math.min(1.0, newSampleSize / 20)

      await prisma.specialization.update({
        where: { agentId_domain: { agentId, domain } },
        data: { accuracy: newAccuracy, sampleSize: newSampleSize, confidence: newConfidence },
      })
    } else {
      await prisma.specialization.create({
        data: {
          agentId,
          domain,
          accuracy: wasCorrect ? 1.0 : 0.0,
          sampleSize: 1,
          confidence: 0.05,
        },
      })
    }
  }

  async getSpecializationBonus(agentId: string, domain: string): Promise<number> {
    const spec = await prisma.specialization.findUnique({
      where: { agentId_domain: { agentId, domain } },
    })

    if (!spec || spec.sampleSize < 3) return 0

    if (spec.accuracy < 0.4 && spec.sampleSize >= MIN_SAMPLES_FOR_PENALTY) {
      return CROSS_DOMAIN_PENALTY
    }

    const bonus = spec.accuracy * spec.confidence * SPECIALIZATION_BONUS_CAP
    return Math.min(SPECIALIZATION_BONUS_CAP, bonus)
  }

  async getWeightWithSpecialization(agentId: string, baseWeight: number, domain: string): Promise<number> {
    const bonus = await this.getSpecializationBonus(agentId, domain)
    const weight = baseWeight * (1 + bonus)
    return Math.min(3.0, Math.max(0.1, weight))
  }

  async getAgentSpecializations(agentId: string): Promise<Array<{
    domain: string
    accuracy: number
    sampleSize: number
    confidence: number
  }>> {
    return prisma.specialization.findMany({
      where: { agentId },
      orderBy: { accuracy: 'desc' },
      select: { domain: true, accuracy: true, sampleSize: true, confidence: true },
    })
  }

  async getAllSpecializationsForDomain(domain: string): Promise<Record<string, number>> {
    const specs = await prisma.specialization.findMany({
      where: { domain },
      select: { agentId: true, accuracy: true, confidence: true, sampleSize: true },
    })

    const result: Record<string, number> = {}
    for (const spec of specs) {
      if (spec.sampleSize < 3) continue
      if (spec.accuracy < 0.4 && spec.sampleSize >= MIN_SAMPLES_FOR_PENALTY) {
        result[spec.agentId] = CROSS_DOMAIN_PENALTY
      } else {
        result[spec.agentId] = Math.min(SPECIALIZATION_BONUS_CAP, spec.accuracy * spec.confidence * SPECIALIZATION_BONUS_CAP)
      }
    }
    return result
  }
}

export const specializationEngine = new SpecializationEngine()
