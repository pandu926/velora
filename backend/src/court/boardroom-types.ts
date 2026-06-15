import { config } from '../config/index.js'

export interface BoardroomAgent {
  id: string
  role: string
  model: string
  description: string
  dataTools: string[]
}

export interface AgentVote {
  agentId: string
  role: string
  model: string
  vote: 'yes' | 'no'
  confidence: number
  reasoning: string
  data: Record<string, unknown>
}

export interface ConsensusRound {
  round: number
  votes: AgentVote[]
  yesCount: number
  noCount: number
  percentage: number
  consensusReached: boolean
  dissent?: string[]
}

export interface BoardroomVerdict {
  action: 'supply' | 'swap' | 'withdraw' | 'rebalance' | 'hold'
  approved: boolean
  finalPercentage: number
  totalRounds: number
  rounds: ConsensusRound[]
  orchestratorSummary: string
  params?: Record<string, unknown>
}

export interface BoardroomSession {
  id: string
  timestamp: number
  agents: BoardroomAgent[]
  verdict: BoardroomVerdict
  evidencePackage: Record<string, unknown>
}

export const BOARDROOM_AGENTS: BoardroomAgent[] = [
  {
    id: 'market-analyst',
    role: 'Market Analyst',
    model: 'deepseek-v4-pro',
    description: 'Price action, momentum, trend analysis',
    dataTools: ['price', 'momentum'],
  },
  {
    id: 'yield-researcher',
    role: 'Yield Researcher',
    model: 'qwen-3-7-plus',
    description: 'DeFi yield comparison, protocol TVL, APY history',
    dataTools: ['yields', 'tvl'],
  },
  {
    id: 'risk-officer',
    role: 'Risk Officer',
    model: 'kimi-k2-6',
    description: 'Challenge proposals, identify failure modes',
    dataTools: ['volatility', 'risk'],
  },
  {
    id: 'sentiment-analyst',
    role: 'Sentiment Analyst',
    model: 'minimax-m3',
    description: 'Market mood, Fear & Greed, social signals',
    dataTools: ['sentiment'],
  },
  {
    id: 'protocol-analyst',
    role: 'Protocol Analyst',
    model: 'nvidia-nemotron-3-ultra-550b-a55b',
    description: 'Smart contract risk, protocol maturity, audit status',
    dataTools: ['protocol'],
  },
  {
    id: 'onchain-analyst',
    role: 'On-Chain Analyst',
    model: 'llama-3.3-70b',
    description: 'On-chain flows, whale movements, liquidity depth',
    dataTools: ['onchain'],
  },
  {
    id: 'technical-auditor',
    role: 'Technical Auditor',
    model: 'zai-org-glm-5-1',
    description: 'Contract code risk, exploit vectors, composability',
    dataTools: ['audit'],
  },
  {
    id: 'macro-analyst',
    role: 'Macro Analyst',
    model: 'gemini-3-5-flash',
    description: 'Macro economic context, correlation to TradFi, regulatory',
    dataTools: ['macro'],
  },
  {
    id: 'quant-strategist',
    role: 'Quant Strategist',
    model: 'deepseek-v4-flash',
    description: 'Position sizing, risk/reward ratio, portfolio allocation',
    dataTools: ['quant'],
  },
]

export const ORCHESTRATOR_MODEL = 'venice-orchestrator'
export const CONSENSUS_THRESHOLD = 0.70
export const MAX_ROUNDS = 3

export const VENICE_BASE_URL = config.veniceBaseUrl || 'https://api.venice.ai/api/v1'
export const VENICE_API_KEY = config.veniceApiKey || ''
