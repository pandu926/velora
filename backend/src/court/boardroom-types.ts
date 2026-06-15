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

export const CHEAP_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'deepseek-v3.2',
  'gemini-3-5-flash',
  'gemini-3-flash-preview',
  'gemini-3-1-pro-preview',
  'llama-3.3-70b',
  'llama-3.2-3b',
  'hermes-3-llama-3.1-405b',
  'qwen-3-7-plus',
  'qwen-3-7-max',
  'qwen-3-6-plus',
  'qwen3-6-27b',
  'qwen3-5-9b',
  'qwen3-5-397b-a17b',
  'qwen3-5-35b-a3b',
  'qwen3-235b-a22b-instruct-2507',
  'qwen3-next-80b',
  'qwen3-coder-480b-a35b-instruct-turbo',
  'mistral-small-3-2-24b-instruct',
  'mistral-small-2603',
  'minimax-m3',
  'minimax-m3-preview',
  'minimax-m25',
  'minimax-m27',
  'kimi-k2-6',
  'kimi-k2-7-code',
  'kimi-k2-5',
  'zai-org-glm-5-1',
  'zai-org-glm-5',
  'z-ai-glm-5-turbo',
  'zai-org-glm-4.7-flash',
  'zai-org-glm-4.7',
  'zai-org-glm-4.6',
  'olafangensan-glm-4.7-flash-heretic',
  'google-gemma-4-26b-a4b-it',
  'google-gemma-4-31b-it',
  'gemma-4-uncensored',
  'google-gemma-3-27b-it',
  'nvidia-nemotron-3-nano-30b-a3b',
  'nvidia-nemotron-3-ultra-550b-a55b',
  'nvidia-nemotron-cascade-2-30b-a3b',
  'mercury-2',
  'openai-gpt-oss-120b',
  'openai-gpt-4o-mini-2024-07-18',
  'tencent-hy3-preview',
  'xiaomi-mimo-v2-5',
  'arcee-trinity-large-thinking',
  'aion-labs-aion-2-0',
  'grok-4-3',
]

export function getNextFallback(exclude: string[]): string | null {
  const available = CHEAP_MODELS.filter(m => !exclude.includes(m))
  if (available.length === 0) return null
  return available[Math.floor(Math.random() * available.length)]!
}

export const BOARDROOM_AGENTS: BoardroomAgent[] = [
  {
    id: 'market-analyst',
    role: 'Market Analyst',
    model: 'deepseek-v4-flash',
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
    model: 'gemini-3-5-flash',
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
    model: 'mistral-small-3-2-24b-instruct',
    description: 'Contract code risk, exploit vectors, composability',
    dataTools: ['audit'],
  },
  {
    id: 'macro-analyst',
    role: 'Macro Analyst',
    model: 'zai-org-glm-4.7-flash',
    description: 'Macro economic context, correlation to TradFi, regulatory',
    dataTools: ['macro'],
  },
  {
    id: 'quant-strategist',
    role: 'Quant Strategist',
    model: 'google-gemma-4-31b-it',
    description: 'Position sizing, risk/reward ratio, portfolio allocation',
    dataTools: ['quant'],
  },
]

export const ORCHESTRATOR_MODEL = 'venice-orchestrator'
export const CONSENSUS_THRESHOLD = 0.70
export const MAX_ROUNDS = 3

export const VENICE_BASE_URL = config.veniceBaseUrl || 'https://api.venice.ai/api/v1'
export const VENICE_API_KEY = config.veniceApiKey || ''
