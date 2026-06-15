import crypto from 'node:crypto'
import { AgentRole } from '../types/permissions.js'
import type { AgentDecision } from './types.js'

export interface ActivityEntry {
  id: string
  timestamp: number
  agent: AgentRole
  action: string
  reasoning: string
  decision: AgentDecision
  txHash?: string
}

/**
 * In-memory activity log for agent decisions.
 * Every AI call logs its full reasoning for the activity feed.
 */
export class ActivityLog {
  private entries: ActivityEntry[] = []
  private listeners: Array<(entry: ActivityEntry) => void> = []

  /**
   * Register a listener that is called whenever a new entry is added.
   * Used for SSE broadcasting.
   */
  onAdd(listener: (entry: ActivityEntry) => void): void {
    this.listeners.push(listener)
  }

  /**
   * Add a new activity entry with auto-generated id and timestamp.
   */
  add(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry {
    const full: ActivityEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...entry,
    }
    this.entries.push(full)

    for (const listener of this.listeners) {
      listener(full)
    }

    return full
  }

  /**
   * Returns the last N entries in reverse chronological order.
   */
  getRecent(limit = 50): ActivityEntry[] {
    return this.entries.slice(-limit).reverse()
  }

  /**
   * Filters entries by agent role.
   */
  getByAgent(agent: AgentRole): ActivityEntry[] {
    return this.entries.filter((entry) => entry.agent === agent)
  }
}
