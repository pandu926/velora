/**
 * Skill Evolver — analyzes trade outcomes and evolves agent skills.
 *
 * Uses Venice AI to propose patches, then applies them to SKILL.md files.
 * Evolution history is append-only (never deletes past evolutions).
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { VeniceInferenceClient, VeniceMessage } from '../services/venice-inference-client.js'
import type { SkillEvolution, SkillHistory, SkillPatch, ParsedSkill } from './types.js'
import { loadSkill, saveSkill } from './skill-loader.js'
import { SKILL_EVOLUTION_PROMPT, buildEvolutionPrompt } from './prompts.js'

const SKILLS_DIR = path.resolve(process.cwd(), 'data', 'skills')

/**
 * Get the path to a role's evolution history file.
 */
function getHistoryPath(role: string): string {
  return path.join(SKILLS_DIR, `${role}.history.json`)
}

/**
 * Serialize a court case object to a readable transcript string.
 */
function courtCaseToTranscript(courtCase: unknown): string {
  if (typeof courtCase === 'string') return courtCase
  try {
    return JSON.stringify(courtCase, null, 2)
  } catch {
    return String(courtCase)
  }
}

/**
 * Apply a single patch to a ParsedSkill, returning a new ParsedSkill.
 */
function applyPatch(skill: ParsedSkill, patch: SkillPatch): ParsedSkill {
  const sectionKey = patch.section
  const items = [...skill[sectionKey]]

  switch (patch.action) {
    case 'add': {
      items.push(patch.content)
      break
    }
    case 'modify': {
      const targetIndex = items.findIndex((item) =>
        item.toLowerCase().includes((patch.target ?? '').toLowerCase())
      )
      if (targetIndex !== -1) {
        items[targetIndex] = patch.content
      } else {
        // Target not found — add as new item instead of silently failing
        items.push(patch.content)
      }
      break
    }
    case 'remove': {
      const removeIndex = items.findIndex((item) =>
        item.toLowerCase().includes((patch.target ?? patch.content).toLowerCase())
      )
      if (removeIndex !== -1) {
        items.splice(removeIndex, 1)
      }
      break
    }
  }

  return {
    ...skill,
    [sectionKey]: items,
  }
}

/**
 * Serialize a ParsedSkill back to its raw markdown representation.
 * Used for storing before/after snapshots in evolution history.
 */
function skillToMarkdown(skill: ParsedSkill): string {
  const fm = skill.frontmatter
  const lines: string[] = [
    '---',
    `name: ${fm.name}`,
    `role: ${fm.role}`,
    `version: ${fm.version}`,
    `lastUpdated: ${fm.lastUpdated}`,
    `evolutionCount: ${fm.evolutionCount}`,
    '---',
    '',
    '## Capabilities',
    ...skill.capabilities.map((c) => `- ${c}`),
    '',
    '## Decision Rules',
    ...skill.decisionRules.map((r) => `- ${r}`),
    '',
    '## Constraints',
    ...skill.constraints.map((c) => `- ${c}`),
    '',
    '## Learned Patterns',
  ]

  if (skill.learnedPatterns.length === 0) {
    lines.push('(None yet — will evolve based on trade outcomes)')
  } else {
    lines.push(...skill.learnedPatterns.map((p) => `- ${p}`))
  }

  lines.push('')
  return lines.join('\n')
}

export class SkillEvolver {
  private readonly veniceClient: VeniceInferenceClient

  constructor(veniceClient: VeniceInferenceClient) {
    this.veniceClient = veniceClient
  }

  /**
   * Call Venice AI to analyze a trade outcome and propose skill patches.
   */
  async analyzeOutcome(
    role: string,
    courtCase: unknown,
    outcome: 'profit' | 'neutral' | 'loss',
    details: string
  ): Promise<SkillPatch[]> {
    const skill = loadSkill(role)
    const skillContent = skillToMarkdown(skill)
    const transcript = courtCaseToTranscript(courtCase)

    const userPrompt = buildEvolutionPrompt(skillContent, transcript, outcome, details)

    const messages: VeniceMessage[] = [
      { role: 'system', content: SKILL_EVOLUTION_PROMPT },
      { role: 'user', content: userPrompt },
    ]

    const response = await this.veniceClient.chat(messages, {
      temperature: 0.4,
      maxTokens: 2048,
    })

    return this.parsePatches(response.content)
  }

  /**
   * Apply patches to a role's skill file and record the evolution.
   */
  applyPatches(
    role: string,
    patches: SkillPatch[],
    outcome: 'profit' | 'neutral' | 'loss',
    details: string
  ): SkillEvolution {
    const originalSkill = loadSkill(role)
    const beforeContent = skillToMarkdown(originalSkill)

    // Apply all patches sequentially
    let evolvedSkill = originalSkill
    for (const patch of patches) {
      evolvedSkill = applyPatch(evolvedSkill, patch)
    }

    // Update frontmatter
    const newVersion = originalSkill.frontmatter.version + 1
    evolvedSkill = {
      ...evolvedSkill,
      frontmatter: {
        ...evolvedSkill.frontmatter,
        version: newVersion,
        lastUpdated: new Date().toISOString().split('T')[0],
        evolutionCount: originalSkill.frontmatter.evolutionCount + 1,
      },
    }

    // Save updated skill
    saveSkill(role, evolvedSkill)

    const afterContent = skillToMarkdown(evolvedSkill)

    // Build evolution record
    const evolution: SkillEvolution = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      version: newVersion,
      trigger: {
        type: 'trade_outcome',
        outcome,
        details,
      },
      patches,
      reasoning: patches.map((p) => p.reasoning).join('; '),
      before: beforeContent,
      after: afterContent,
    }

    // Append to history
    this.appendHistory(role, evolution)

    return evolution
  }

  /**
   * Load the evolution history for a role.
   */
  getHistory(role: string): SkillHistory {
    const historyPath = getHistoryPath(role)

    if (!fs.existsSync(historyPath)) {
      return { role, evolutions: [] }
    }

    try {
      const raw = fs.readFileSync(historyPath, 'utf-8')
      const evolutions: unknown = JSON.parse(raw)
      if (!Array.isArray(evolutions)) {
        return { role, evolutions: [] }
      }
      return { role, evolutions: evolutions as SkillEvolution[] }
    } catch {
      return { role, evolutions: [] }
    }
  }

  /**
   * Convenience method: analyze outcome then apply patches.
   */
  async evolve(
    role: string,
    courtCase: unknown,
    outcome: 'profit' | 'neutral' | 'loss',
    details: string
  ): Promise<SkillEvolution> {
    const patches = await this.analyzeOutcome(role, courtCase, outcome, details)
    return this.applyPatches(role, patches, outcome, details)
  }

  /**
   * Parse Venice response into SkillPatch array.
   * Handles potential JSON wrapped in markdown code blocks.
   */
  private parsePatches(content: string): SkillPatch[] {
    let cleaned = content.trim()

    // Strip markdown code block if present
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    try {
      const parsed: unknown = JSON.parse(cleaned)
      if (!Array.isArray(parsed)) {
        return []
      }
      return this.validatePatches(parsed)
    } catch {
      return []
    }
  }

  /**
   * Validate and sanitize parsed patches.
   */
  private validatePatches(raw: unknown[]): SkillPatch[] {
    const validSections = new Set(['capabilities', 'decisionRules', 'constraints', 'learnedPatterns'])
    const validActions = new Set(['add', 'modify', 'remove'])

    return raw
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null
      )
      .filter((item) =>
        validSections.has(item['section'] as string) &&
        validActions.has(item['action'] as string) &&
        typeof item['content'] === 'string' &&
        typeof item['reasoning'] === 'string'
      )
      .map((item) => ({
        section: item['section'] as SkillPatch['section'],
        action: item['action'] as SkillPatch['action'],
        target: typeof item['target'] === 'string' ? item['target'] : undefined,
        content: item['content'] as string,
        reasoning: item['reasoning'] as string,
      }))
  }

  /**
   * Append an evolution to the role's history file (append-only).
   */
  private appendHistory(role: string, evolution: SkillEvolution): void {
    const historyPath = getHistoryPath(role)
    const history = this.getHistory(role)
    const updated = [...history.evolutions, evolution]

    const dir = path.dirname(historyPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(historyPath, JSON.stringify(updated, null, 2), 'utf-8')
  }
}
