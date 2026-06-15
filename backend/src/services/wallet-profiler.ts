import { config } from '../config/index.js'

const ALCHEMY_KEYS: Record<string, string> = {
  base: 'https://base-mainnet.g.alchemy.com/v2/Kgzqrx202_d8qgesCF9-A',
  ethereum: 'https://eth-mainnet.g.alchemy.com/v2/Kgzqrx202_d8qgesCF9-A',
  arbitrum: 'https://arb-mainnet.g.alchemy.com/v2/Kgzqrx202_d8qgesCF9-A',
  polygon: 'https://polygon-mainnet.g.alchemy.com/v2/Kgzqrx202_d8qgesCF9-A',
}

interface Transfer {
  asset: string | null
  category: string
  value: number | null
  from: string
  to: string
  blockNum: string
}

interface ChainActivity {
  chain: string
  txCount: number
  outgoing: Transfer[]
  incoming: Transfer[]
}

export interface WalletProfile {
  address: string
  chains: ChainActivity[]
  summary: {
    totalTxCount: number
    activeChains: string[]
    topAssets: string[]
    avgTxValue: number
    maxTxValue: number
    uniqueInteractions: number
    hasDefiActivity: boolean
    hasBridgeActivity: boolean
  }
  aiProfile: {
    riskAppetite: 'conservative' | 'balanced' | 'aggressive'
    experience: 'beginner' | 'intermediate' | 'advanced'
    persona: string
    reasoning: string
    recommendedThreshold: number
    maxPositionPct: number
    minProtocolTvl: number
    minProtocolAgeDays: number
  }
}

async function fetchAlchemyTransfers(
  chainUrl: string,
  address: string,
  direction: 'from' | 'to'
): Promise<Transfer[]> {
  const params: Record<string, unknown> = {
    category: ['external', 'erc20'],
    maxCount: '0x1E',
    order: 'desc',
  }
  if (direction === 'from') params.fromAddress = address
  else params.toAddress = address

  try {
    const res = await fetch(chainUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'alchemy_getAssetTransfers',
        params: [params],
        id: 1,
      }),
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) return []
    const data = await res.json() as { result?: { transfers?: Transfer[] } }
    return data.result?.transfers ?? []
  } catch {
    return []
  }
}

function isSpamToken(asset: string | null): boolean {
  if (!asset) return true
  const spam = ['t.me', 'claim', 'visit:', 'reward', 'airdrop', 'voucher', '.live', '.so']
  const lower = asset.toLowerCase()
  return spam.some(s => lower.includes(s)) || asset.length > 20
}

function analyzeChainData(chains: ChainActivity[]): WalletProfile['summary'] {
  const allOutgoing = chains.flatMap(c => c.outgoing).filter(t => !isSpamToken(t.asset))
  const allIncoming = chains.flatMap(c => c.incoming).filter(t => !isSpamToken(t.asset))
  const allTx = [...allOutgoing, ...allIncoming]

  const totalTxCount = chains.reduce((s, c) => s + c.txCount, 0)
  const activeChains = chains.filter(c => c.txCount > 0).map(c => c.chain)

  const assetCounts: Record<string, number> = {}
  for (const t of allTx) {
    if (t.asset && !isSpamToken(t.asset)) {
      assetCounts[t.asset] = (assetCounts[t.asset] || 0) + 1
    }
  }
  const topAssets = Object.entries(assetCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([asset]) => asset)

  const values = allTx.map(t => t.value ?? 0).filter(v => v > 0)
  const avgTxValue = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const maxTxValue = values.length > 0 ? Math.max(...values) : 0

  const uniqueAddresses = new Set(allOutgoing.map(t => t.to))
  const uniqueInteractions = uniqueAddresses.size

  const defiKeywords = ['aave', 'compound', 'uniswap', 'sushi', 'curve', 'aerodrome', 'morpho', 'lido']
  const hasDefiActivity = allTx.some(t =>
    defiKeywords.some(k => (t.to || '').toLowerCase().includes(k) || (t.asset || '').toLowerCase().includes(k))
  )

  const hasBridgeActivity = activeChains.length >= 2

  return {
    totalTxCount,
    activeChains,
    topAssets,
    avgTxValue: Number(avgTxValue.toFixed(4)),
    maxTxValue: Number(maxTxValue.toFixed(4)),
    uniqueInteractions,
    hasDefiActivity,
    hasBridgeActivity,
  }
}

async function generateAIProfile(
  address: string,
  summary: WalletProfile['summary'],
  chains: ChainActivity[]
): Promise<WalletProfile['aiProfile']> {
  const chainSummaries = chains.map(c => {
    const real = c.outgoing.filter(t => !isSpamToken(t.asset))
    return `${c.chain}: ${c.txCount} nonce, ${real.length} real outgoing tx, assets: ${real.map(t => `${t.asset}(${t.value})`).slice(0, 5).join(', ')}`
  }).join('\n')

  const prompt = `Analyze this crypto wallet's on-chain behavior and generate a risk profile.

WALLET: ${address}
TOTAL TX: ${summary.totalTxCount} across ${summary.activeChains.length} chains (${summary.activeChains.join(', ')})
AVG TX VALUE: $${summary.avgTxValue.toFixed(2)}
MAX TX VALUE: $${summary.maxTxValue.toFixed(2)}
UNIQUE INTERACTIONS: ${summary.uniqueInteractions} addresses
DEFI ACTIVITY: ${summary.hasDefiActivity}
BRIDGE ACTIVITY: ${summary.hasBridgeActivity}
TOP ASSETS: ${summary.topAssets.join(', ')}

Rules:
- Small frequent tx = cautious. Large single tx = risk-taking.
- Multi-chain = experienced. DeFi interaction = yield-aware.
- Only transfers, no DeFi = basic user.

Output JSON only:
{"riskAppetite":"conservative|balanced|aggressive","experience":"beginner|intermediate|advanced","persona":"2-3 words","reasoning":"1-2 sentences","recommendedThreshold":60-85,"maxPositionPct":10-50,"minProtocolTvl":1000000-500000000,"minProtocolAgeDays":7-365}`

  const VENICE_URL = config.veniceBaseUrl || 'https://api.venice.ai/api/v1'
  const VENICE_KEY = config.veniceApiKey || ''

  try {
    const res = await fetch(`${VENICE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VENICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V4-Flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) throw new Error('AI call failed')
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data.choices?.[0]?.message?.content ?? ''
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*"riskAppetite"[\s\S]*\}/)
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as Record<string, unknown>

    return {
      riskAppetite: ['conservative', 'balanced', 'aggressive'].includes(parsed.riskAppetite as string)
        ? parsed.riskAppetite as WalletProfile['aiProfile']['riskAppetite']
        : 'balanced',
      experience: ['beginner', 'intermediate', 'advanced'].includes(parsed.experience as string)
        ? parsed.experience as WalletProfile['aiProfile']['experience']
        : 'intermediate',
      persona: typeof parsed.persona === 'string' ? parsed.persona : 'Crypto User',
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'Profile generated from on-chain data',
      recommendedThreshold: typeof parsed.recommendedThreshold === 'number' ? parsed.recommendedThreshold / 100 : 0.7,
      maxPositionPct: typeof parsed.maxPositionPct === 'number' ? parsed.maxPositionPct : 30,
      minProtocolTvl: typeof parsed.minProtocolTvl === 'number' ? parsed.minProtocolTvl : 100_000_000,
      minProtocolAgeDays: typeof parsed.minProtocolAgeDays === 'number' ? parsed.minProtocolAgeDays : 90,
    }
  } catch {
    return {
      riskAppetite: 'balanced',
      experience: 'intermediate',
      persona: 'Unclassified User',
      reasoning: 'AI profile generation failed — using default balanced profile.',
      recommendedThreshold: 0.7,
      maxPositionPct: 30,
      minProtocolTvl: 100_000_000,
      minProtocolAgeDays: 90,
    }
  }
}

export async function analyzeWalletProfile(address: string): Promise<WalletProfile> {
  const chains: ChainActivity[] = []

  const chainEntries = Object.entries(ALCHEMY_KEYS)
  const results = await Promise.all(
    chainEntries.map(async ([chain, url]) => {
      const [outgoing, incoming] = await Promise.all([
        fetchAlchemyTransfers(url, address, 'from'),
        fetchAlchemyTransfers(url, address, 'to'),
      ])

      const nonce = outgoing.length > 0 ? outgoing.length : 0

      return {
        chain,
        txCount: nonce,
        outgoing,
        incoming,
      }
    })
  )

  chains.push(...results)

  const summary = analyzeChainData(chains)
  const aiProfile = await generateAIProfile(address, summary, chains)

  return { address, chains, summary, aiProfile }
}

/**
 * Get or create a user profile with AI-generated risk assessment.
 * Caches in DB — subsequent calls for the same wallet return instantly.
 */
export async function getOrCreateProfile(address: string) {
  const { prisma } = await import('../db/client.js')

  const existing = await prisma.userProfile.findUnique({
    where: { walletAddress: address.toLowerCase() },
  })

  if (existing?.aiProfile) {
    return existing
  }

  let aiProfile: Record<string, unknown> = { riskAppetite: 'moderate' }
  let riskAppetite = 'moderate'

  try {
    const profile = await analyzeWalletProfile(address)
    aiProfile = profile.aiProfile as unknown as Record<string, unknown>
    riskAppetite = (aiProfile.riskAppetite as string) || 'moderate'
  } catch {
    // Default profile on failure
  }

  const result = await prisma.userProfile.upsert({
    where: { walletAddress: address.toLowerCase() },
    create: {
      walletAddress: address.toLowerCase(),
      riskAppetite,
      maxPositionPct: (aiProfile.maxPositionPct as number) || 25,
      aiProfile: aiProfile as any,
    },
    update: {
      riskAppetite,
      maxPositionPct: (aiProfile.maxPositionPct as number) || 25,
      aiProfile: aiProfile as any,
    },
  })

  return result
}
