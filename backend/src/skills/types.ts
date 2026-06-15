/**
 * Types for the Self-Evolving Skills system.
 * Agents have SKILL.md files that define their behavior,
 * and they rewrite their own skills based on trade outcomes.
 */

export interface SkillFrontmatter {
  name: string
  role: string
  version: number
  lastUpdated: string
  evolutionCount: number
}

export interface ParsedSkill {
  frontmatter: SkillFrontmatter
  capabilities: string[]
  decisionRules: string[]
  constraints: string[]
  learnedPatterns: string[]
  rawContent: string
}

export interface SkillPatch {
  section: 'capabilities' | 'decisionRules' | 'constraints' | 'learnedPatterns'
  action: 'add' | 'modify' | 'remove'
  target?: string
  content: string
  reasoning: string
}

export interface SkillEvolution {
  id: string
  timestamp: number
  version: number
  trigger: {
    type: 'trade_outcome'
    outcome: 'profit' | 'neutral' | 'loss'
    details: string
  }
  patches: SkillPatch[]
  reasoning: string
  before: string
  after: string
}

export interface SkillHistory {
  role: string
  evolutions: SkillEvolution[]
}
