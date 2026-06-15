import { prisma } from '../db/client.js'
import { config } from '../config/index.js'

const VENICE_BASE_URL = config.veniceBaseUrl || 'https://api.venice.ai/api/v1'
const VENICE_API_KEY = config.veniceApiKey || ''

interface RelevantCase {
  id: string
  domain: string
  proposal: string
  outcome: string | null
  lessonSummary: string | null
  riskLevel: string
  createdAt: Date
}

export class CaseLawEngine {
  async storeCaseLaw(
    sessionId: string,
    domain: string,
    riskLevel: string,
    protocol?: string,
    marketCondition?: string
  ): Promise<void> {
    const tags = [domain, riskLevel]
    if (protocol) tags.push(protocol)
    if (marketCondition) tags.push(marketCondition)

    await prisma.caseLaw.upsert({
      where: { sessionId },
      update: { domain, riskLevel, protocol, marketCondition, tags },
      create: { sessionId, domain, riskLevel, protocol, marketCondition, tags },
    })
  }

  async generateLessonSummary(sessionId: string): Promise<string> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { outcome: true, votes: true },
    })

    if (!session || !session.outcome) return ''

    const yesCount = session.votes.filter(v => v.vote === 'yes').length
    const noCount = session.votes.filter(v => v.vote === 'no').length

    const prompt = `Summarize this DeFi boardroom decision in ONE sentence for future reference:

Proposal: ${session.proposal}
Verdict: ${session.verdictAction} (${yesCount} YES, ${noCount} NO)
Outcome: ${session.outcome.result}${session.outcome.valueDelta ? ` ($${session.outcome.valueDelta.toFixed(2)})` : ''}

Write a single sentence lesson learned. Be specific and actionable. Example:
"Supply to Aave at 3.2% during extreme fear yielded +$16 over 7 days — low-risk lending works in fear markets."`

    try {
      const res = await fetch(`${VENICE_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${VENICE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-ai/DeepSeek-V4-Flash',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(15000),
      })

      if (!res.ok) return ''
      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      const lesson = data.choices?.[0]?.message?.content?.trim().slice(0, 200) ?? ''

      await prisma.caseLaw.update({
        where: { sessionId },
        data: { lessonSummary: lesson, outcome: session.outcome.result },
      })

      return lesson
    } catch {
      return ''
    }
  }

  async getRelevantCases(
    domain: string,
    riskLevel?: string,
    maxTokenBudget = 500,
    limit = 5
  ): Promise<RelevantCase[]> {
    const cases = await prisma.caseLaw.findMany({
      where: {
        domain,
        outcome: { not: null },
        lessonSummary: { not: null },
        ...(riskLevel ? { riskLevel } : {}),
      },
      include: { session: { select: { proposal: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit * 2,
    })

    const relevant: RelevantCase[] = cases.map(c => ({
      id: c.id,
      domain: c.domain,
      proposal: c.session.proposal,
      outcome: c.outcome,
      lessonSummary: c.lessonSummary,
      riskLevel: c.riskLevel,
      createdAt: c.createdAt,
    }))

    let tokenCount = 0
    const selected: RelevantCase[] = []
    let hasProfit = false
    let hasLoss = false

    for (const c of relevant) {
      const caseTokens = (c.lessonSummary?.length ?? 0) / 4
      if (tokenCount + caseTokens > maxTokenBudget) break

      if (c.outcome === 'profit' && hasProfit && selected.length >= 2) continue
      if (c.outcome === 'loss' && hasLoss && selected.length >= 2) continue

      selected.push(c)
      tokenCount += caseTokens
      if (c.outcome === 'profit') hasProfit = true
      if (c.outcome === 'loss') hasLoss = true

      if (selected.length >= limit) break
    }

    return selected
  }

  formatCasesForPrompt(cases: RelevantCase[]): string {
    if (cases.length === 0) return ''

    const formatted = cases.map((c, i) =>
      `PRECEDENT ${i + 1}: [${c.domain}/${c.riskLevel}] "${c.proposal.slice(0, 80)}" → ${c.outcome}. Lesson: ${c.lessonSummary}`
    ).join('\n')

    return `\nHISTORICAL PRECEDENTS:\n${formatted}\n`
  }

  async getCaseCount(): Promise<number> {
    return prisma.caseLaw.count({ where: { outcome: { not: null } } })
  }
}

export const caseLawEngine = new CaseLawEngine()
