import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { AgentDecision } from './types.js'
import type { VeniceInferenceClient, VeniceMessage } from '../services/venice-inference-client.js'

/**
 * A single learning history entry tracking a past decision and its outcome.
 */
export interface LearningEntry {
  id: string
  timestamp: number
  context_summary: string
  debate_summary: string
  decision: AgentDecision
  outcome?: 'profit' | 'neutral' | 'loss'
  lessons_learned?: string
}

const MAX_ENTRIES = 100
const RECENT_ENTRIES_LIMIT = 20
const DATA_DIR = path.resolve(process.cwd(), 'data')
const HISTORY_FILE = path.join(DATA_DIR, 'learning-history.json')

/**
 * Learning Engine — tracks decision outcomes and improves over time.
 *
 * Uses Venice AI for pattern analysis. Stores history in a JSON file
 * (backend/data/learning-history.json) with FIFO eviction at 100 entries.
 */
export class LearningEngine {
  private readonly veniceClient: VeniceInferenceClient

  constructor(veniceClient: VeniceInferenceClient) {
    this.veniceClient = veniceClient
    this.ensureDataDir()
  }

  /**
   * Load the most recent entries from the history file.
   * Returns last 20 entries (most recent first).
   */
  loadHistory(): LearningEntry[] {
    const all = this.readFile()
    return all.slice(-RECENT_ENTRIES_LIMIT)
  }

  /**
   * Save a new learning entry. Appends to file, caps at 100 entries (FIFO).
   */
  saveEntry(entry: Omit<LearningEntry, 'id' | 'timestamp'>): void {
    const all = this.readFile()

    const newEntry: LearningEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...entry,
    }

    const updated = [...all, newEntry]

    // FIFO eviction: keep only the most recent MAX_ENTRIES
    const trimmed = updated.length > MAX_ENTRIES
      ? updated.slice(updated.length - MAX_ENTRIES)
      : updated

    this.writeFile(trimmed)
  }

  /**
   * Record the outcome of a past decision by entry ID.
   */
  recordOutcome(entryId: string, outcome: 'profit' | 'neutral' | 'loss'): void {
    const all = this.readFile()
    const updated = all.map((entry) =>
      entry.id === entryId ? { ...entry, outcome } : entry
    )
    this.writeFile(updated)
  }

  /**
   * Analyze patterns from past decisions using Venice AI.
   * Returns lessons text to inject into Scout's prompt.
   */
  async analyzeLessons(history: LearningEntry[]): Promise<string> {
    if (history.length === 0) {
      return 'No historical decisions to analyze yet.'
    }

    const scored = history.filter((e) => e.outcome !== undefined)
    if (scored.length === 0) {
      return 'No scored decisions yet — outcomes pending.'
    }

    const historySummary = scored
      .map((e) => {
        const outcomeLabel = e.outcome ?? 'unknown'
        return `- [${outcomeLabel.toUpperCase()}] ${e.decision.action} (conf: ${e.decision.confidence.toFixed(2)}): ${e.context_summary}`
      })
      .join('\n')

    const messages: VeniceMessage[] = [
      {
        role: 'system',
        content: `You are analyzing the decision history of a DeFi portfolio agent. Extract actionable lessons and patterns from past decisions. Be concise — max 3-5 bullet points. Focus on what to repeat and what to avoid.`,
      },
      {
        role: 'user',
        content: `DECISION HISTORY (${scored.length} scored decisions):
${historySummary}

What patterns do you see? What lessons should guide future decisions? Respond with plain text bullet points.`,
      },
    ]

    try {
      const response = await this.veniceClient.chat(messages)
      return response.content.trim()
    } catch {
      return 'Unable to analyze lessons — Venice unavailable.'
    }
  }

  /**
   * Ensure the data directory and history file exist.
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true })
    }
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, '[]', 'utf-8')
    }
  }

  /**
   * Read all entries from the JSON file.
   */
  private readFile(): LearningEntry[] {
    try {
      const raw = fs.readFileSync(HISTORY_FILE, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        return []
      }
      return parsed as LearningEntry[]
    } catch {
      return []
    }
  }

  /**
   * Write entries to the JSON file (atomic overwrite).
   */
  private writeFile(entries: LearningEntry[]): void {
    this.ensureDataDir()
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf-8')
  }
}
