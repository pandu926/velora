/**
 * Skill Loader — parses, loads, saves, and formats SKILL.md files.
 *
 * SKILL.md format:
 *   ---
 *   frontmatter key: value pairs
 *   ---
 *   ## Section Name
 *   - bullet point items
 */

import fs from 'node:fs'
import path from 'node:path'
import type { ParsedSkill, SkillFrontmatter } from './types.js'

const SKILLS_DIR = path.resolve(process.cwd(), 'data', 'skills')

const SECTION_MAP: Record<string, keyof Pick<ParsedSkill, 'capabilities' | 'decisionRules' | 'constraints' | 'learnedPatterns'>> = {
  'Capabilities': 'capabilities',
  'Decision Rules': 'decisionRules',
  'Constraints': 'constraints',
  'Learned Patterns': 'learnedPatterns',
}

/**
 * Parse frontmatter between --- markers into SkillFrontmatter.
 */
function parseFrontmatter(raw: string): SkillFrontmatter {
  const lines = raw.trim().split('\n')
  const data: Record<string, string> = {}

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()
    data[key] = value
  }

  return {
    name: data['name'] ?? '',
    role: data['role'] ?? '',
    version: parseInt(data['version'] ?? '1', 10),
    lastUpdated: data['lastUpdated'] ?? '',
    evolutionCount: parseInt(data['evolutionCount'] ?? '0', 10),
  }
}

/**
 * Extract bullet points from a section body.
 * Lines starting with "- " are treated as items.
 * Parenthetical placeholder lines like "(None yet...)" are ignored.
 */
function extractBullets(body: string): string[] {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2))
}

/**
 * Parse a SKILL.md content string into a ParsedSkill object.
 */
export function parseSkillMd(content: string): ParsedSkill {
  const skill: ParsedSkill = {
    frontmatter: { name: '', role: '', version: 1, lastUpdated: '', evolutionCount: 0 },
    capabilities: [],
    decisionRules: [],
    constraints: [],
    learnedPatterns: [],
    rawContent: content,
  }

  // Extract frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (fmMatch) {
    skill.frontmatter = parseFrontmatter(fmMatch[1])
  }

  // Extract sections
  const sectionRegex = /^## (.+)$/gm
  const sections: Array<{ name: string; startIndex: number }> = []
  let match: RegExpExecArray | null = null

  while ((match = sectionRegex.exec(content)) !== null) {
    sections.push({ name: match[1], startIndex: match.index + match[0].length })
  }

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]
    const endIndex = i + 1 < sections.length ? sections[i + 1].startIndex - sections[i + 1].name.length - 3 : content.length
    const body = content.slice(section.startIndex, endIndex)
    const fieldKey = SECTION_MAP[section.name]

    if (fieldKey) {
      skill[fieldKey] = extractBullets(body)
    }
  }

  return skill
}

/**
 * Serialize a ParsedSkill back to SKILL.md format.
 */
function serializeSkill(skill: ParsedSkill): string {
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

/**
 * Get the file path for a role's skill file.
 */
function getSkillPath(role: string): string {
  return path.join(SKILLS_DIR, `${role}.skill.md`)
}

/**
 * Load and parse a skill file for the given role.
 * Throws if the file does not exist.
 */
export function loadSkill(role: string): ParsedSkill {
  const filePath = getSkillPath(role)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Skill file not found for role: ${role}`)
  }

  const content = fs.readFileSync(filePath, 'utf-8')
  return parseSkillMd(content)
}

/**
 * Serialize and save a ParsedSkill to disk.
 */
export function saveSkill(role: string, skill: ParsedSkill): void {
  const filePath = getSkillPath(role)
  const dir = path.dirname(filePath)

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const content = serializeSkill(skill)
  fs.writeFileSync(filePath, content, 'utf-8')
}

/**
 * Load a skill and format it as text suitable for injection into AI prompts.
 * Returns a structured text block with role, capabilities, rules, and constraints.
 */
export function getSkillAsPromptContext(role: string): string {
  const skill = loadSkill(role)
  const fm = skill.frontmatter

  const sections: string[] = [
    `=== SKILL: ${fm.name} (v${fm.version}) ===`,
    '',
    'CAPABILITIES:',
    ...skill.capabilities.map((c) => `  - ${c}`),
    '',
    'DECISION RULES:',
    ...skill.decisionRules.map((r) => `  - ${r}`),
    '',
    'CONSTRAINTS:',
    ...skill.constraints.map((c) => `  - ${c}`),
  ]

  if (skill.learnedPatterns.length > 0) {
    sections.push('', 'LEARNED PATTERNS:')
    sections.push(...skill.learnedPatterns.map((p) => `  - ${p}`))
  }

  sections.push('', `=== END SKILL (evolved ${fm.evolutionCount} times) ===`)

  return sections.join('\n')
}
