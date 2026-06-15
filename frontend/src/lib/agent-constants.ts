export const AGENT_IDS = ['market-analyst','yield-researcher','risk-officer','sentiment-analyst','protocol-analyst','onchain-analyst','technical-auditor','macro-analyst','quant-strategist']

export const AGENT_NAMES: Record<string, string> = {
  'market-analyst': 'Market',
  'yield-researcher': 'Yield',
  'risk-officer': 'Risk',
  'sentiment-analyst': 'Sentiment',
  'protocol-analyst': 'Protocol',
  'onchain-analyst': 'On-Chain',
  'technical-auditor': 'Auditor',
  'macro-analyst': 'Macro',
  'quant-strategist': 'Quant',
}

export const AGENT_FULL_NAMES: Record<string, string> = {
  'market-analyst': 'Market Analyst',
  'yield-researcher': 'Yield Researcher',
  'risk-officer': 'Risk Officer',
  'sentiment-analyst': 'Sentiment Analyst',
  'protocol-analyst': 'Protocol Analyst',
  'onchain-analyst': 'On-Chain Analyst',
  'technical-auditor': 'Technical Auditor',
  'macro-analyst': 'Macro Analyst',
  'quant-strategist': 'Quant Strategist',
}

export const AGENT_COLORS: Record<string, { bg: string; border: string; text: string; glow: string; blob: string }> = {
  'market-analyst': { bg: 'bg-blue-500/20', border: 'border-blue-500/50', text: 'text-blue-400', glow: 'shadow-blue-500/30', blob: 'from-blue-400 to-blue-600' },
  'yield-researcher': { bg: 'bg-cyan-500/20', border: 'border-cyan-500/50', text: 'text-cyan-400', glow: 'shadow-cyan-500/30', blob: 'from-cyan-400 to-cyan-600' },
  'risk-officer': { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', glow: 'shadow-red-500/30', blob: 'from-red-400 to-red-600' },
  'sentiment-analyst': { bg: 'bg-pink-500/20', border: 'border-pink-500/50', text: 'text-pink-400', glow: 'shadow-pink-500/30', blob: 'from-pink-400 to-pink-600' },
  'protocol-analyst': { bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', text: 'text-emerald-400', glow: 'shadow-emerald-500/30', blob: 'from-emerald-400 to-emerald-600' },
  'onchain-analyst': { bg: 'bg-purple-500/20', border: 'border-purple-500/50', text: 'text-purple-400', glow: 'shadow-purple-500/30', blob: 'from-purple-400 to-purple-600' },
  'technical-auditor': { bg: 'bg-amber-500/20', border: 'border-amber-500/50', text: 'text-amber-400', glow: 'shadow-amber-500/30', blob: 'from-amber-400 to-amber-600' },
  'macro-analyst': { bg: 'bg-orange-500/20', border: 'border-orange-500/50', text: 'text-orange-400', glow: 'shadow-orange-500/30', blob: 'from-orange-400 to-orange-600' },
  'quant-strategist': { bg: 'bg-indigo-500/20', border: 'border-indigo-500/50', text: 'text-indigo-400', glow: 'shadow-indigo-500/30', blob: 'from-indigo-400 to-indigo-600' },
}
