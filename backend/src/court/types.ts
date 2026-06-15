/**
 * Evidence Court types — adversarial debate system where every AI claim
 * must be backed by real on-chain evidence.
 */

export type EvidenceType =
  | 'price_data'
  | 'pool_stats'
  | 'historical_tx'
  | 'aave_rate'
  | 'balance_snapshot'
  | 'market_data'
  | 'sentiment'
  | 'yield_comparison'
  | 'volatility'

export interface Evidence {
  type: EvidenceType
  source: string // contract address or data source
  data: Record<string, unknown> // the actual evidence data
  timestamp: number // when evidence was collected
  blockNumber?: number // block at which evidence was read
  description: string // human-readable description
}

export interface CourtArgument {
  claim: string // what the agent claims
  reasoning: string // why they believe this
  evidence: Evidence[] // on-chain proof supporting the claim
  confidence: number // 0-1
}

export interface DebateRound {
  round: number
  prosecution: CourtArgument // Scout's case
  defense: CourtArgument // Skeptic's counter-case
}

export interface Verdict {
  decision: 'prosecution' | 'defense' | 'insufficient_evidence'
  reasoning: string
  evidenceScore: number // 0-100, how well-supported the winning argument was
  action: 'hold' | 'swap' | 'supply' | 'withdraw' | 'rebalance'
  params?: Record<string, unknown>
}

export interface CourtCase {
  id: string
  timestamp: number
  rounds: DebateRound[]
  verdict: Verdict
  converged: boolean
  totalRounds: number
  transcript: string // formatted human-readable transcript
}

export interface CourtConfig {
  maxRounds: number // default 4
  minEvidenceScore: number // default 50, below this = "hold"
  convergenceThreshold: number // default 0.8
}

export const DEFAULT_COURT_CONFIG: CourtConfig = {
  maxRounds: 4,
  minEvidenceScore: 40,
  convergenceThreshold: 0.8,
}
