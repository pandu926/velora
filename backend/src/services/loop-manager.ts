import type { Address } from 'viem'
import { AutonomousLoop, type AutonomousConfig } from '../strategy/autonomous-loop.js'

/**
 * Per-user autonomous loop registry.
 * Each wallet address gets its own independent loop instance.
 */
class LoopManager {
  private loops = new Map<string, AutonomousLoop>()

  getOrCreate(userAddress: string): AutonomousLoop {
    const key = userAddress.toLowerCase()
    let loop = this.loops.get(key)
    if (!loop) {
      loop = new AutonomousLoop()
      this.loops.set(key, loop)
    }
    return loop
  }

  get(userAddress: string): AutonomousLoop | undefined {
    return this.loops.get(userAddress.toLowerCase())
  }

  remove(userAddress: string): void {
    const key = userAddress.toLowerCase()
    const loop = this.loops.get(key)
    if (loop) {
      loop.stop()
      this.loops.delete(key)
    }
  }

  getAll(): Map<string, AutonomousLoop> {
    return this.loops
  }

  getActiveCount(): number {
    let count = 0
    for (const loop of this.loops.values()) {
      if (loop.getState().status !== 'idle' && loop.getState().status !== 'stopped') {
        count++
      }
    }
    return count
  }
}

export const loopManager = new LoopManager()
