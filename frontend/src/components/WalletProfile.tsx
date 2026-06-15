'use client'

import { useState, useCallback } from 'react'

interface AIProfile {
  riskAppetite: 'conservative' | 'balanced' | 'aggressive'
  experience: 'beginner' | 'intermediate' | 'advanced'
  persona: string
  reasoning: string
  recommendedThreshold: number
  maxPositionPct: number
  minProtocolTvl: number
  minProtocolAgeDays: number
}

interface ProfileData {
  address: string
  summary: {
    totalTxCount: number
    activeChains: string[]
    topAssets: string[]
    avgTxValue: number
    maxTxValue: number
    hasDefiActivity: boolean
    hasBridgeActivity: boolean
  }
  aiProfile: AIProfile
}

const RISK_COLORS = {
  conservative: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400' },
  balanced: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  aggressive: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
}

export function WalletProfile({ address, onProfileLoaded }: {
  address?: string
  onProfileLoaded?: (profile: AIProfile) => void
}) {
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputAddress, setInputAddress] = useState(address || '')

  const analyzeWallet = useCallback(async (addr?: string) => {
    const target = addr || inputAddress
    if (!target || !/^0x[a-fA-F0-9]{40}$/.test(target)) {
      setError('Invalid address')
      return
    }

    setIsLoading(true)
    setError(null)
    setProfile(null)

    try {
      const res = await fetch(`/api/boardroom/profile/${target}`)
      if (!res.ok) throw new Error(`Analysis failed: ${res.status}`)
      const data = await res.json()
      setProfile(data.profile)
      if (data.profile?.aiProfile && onProfileLoaded) {
        onProfileLoaded(data.profile.aiProfile)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIsLoading(false)
    }
  }, [inputAddress, onProfileLoaded])

  const colors = profile ? RISK_COLORS[profile.aiProfile.riskAppetite] : null

  return (
    <div className="space-y-3">
      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputAddress}
          onChange={(e) => setInputAddress(e.target.value)}
          placeholder="0x... wallet address"
          className="flex-1 px-3 py-2 text-[11px] font-mono rounded-lg bg-white/[0.03] border border-white/[0.08] text-gray-200 placeholder-gray-600 focus:outline-none focus:border-white/20"
        />
        <button
          onClick={() => analyzeWallet()}
          disabled={isLoading}
          className="px-3 py-2 text-[10px] font-bold rounded-lg bg-white/[0.06] border border-white/[0.1] text-gray-300 hover:bg-white/[0.1] disabled:opacity-50 transition-all"
        >
          {isLoading ? 'Scanning...' : 'Analyze'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] animate-pulse">
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Scanning 4 chains: Base, Ethereum, Arbitrum, Polygon...
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}

      {/* Profile Result */}
      {profile && colors && (
        <div className={`p-4 rounded-xl ${colors.bg} border ${colors.border} space-y-3 animate-fade-in`}>
          {/* Persona header */}
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-bold ${colors.text}`}>{profile.aiProfile.persona}</p>
              <p className="text-[10px] text-gray-400">{profile.address.slice(0, 8)}...{profile.address.slice(-6)}</p>
            </div>
            <div className="text-right">
              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${colors.bg} ${colors.text} border ${colors.border}`}>
                {profile.aiProfile.riskAppetite}
              </span>
              <p className="text-[9px] text-gray-500 mt-0.5">{profile.aiProfile.experience}</p>
            </div>
          </div>

          {/* AI Reasoning */}
          <p className="text-[10px] text-gray-300 leading-relaxed">
            {profile.aiProfile.reasoning}
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="px-2.5 py-2 rounded-lg bg-black/20">
              <p className="text-[9px] text-gray-500">Chains Active</p>
              <p className="text-[11px] text-white font-medium">{profile.summary.activeChains.join(', ')}</p>
            </div>
            <div className="px-2.5 py-2 rounded-lg bg-black/20">
              <p className="text-[9px] text-gray-500">Total Transactions</p>
              <p className="text-[11px] text-white font-medium">{profile.summary.totalTxCount}</p>
            </div>
            <div className="px-2.5 py-2 rounded-lg bg-black/20">
              <p className="text-[9px] text-gray-500">Consensus Threshold</p>
              <p className="text-[11px] text-white font-medium">{Math.round(profile.aiProfile.recommendedThreshold * 100)}%</p>
            </div>
            <div className="px-2.5 py-2 rounded-lg bg-black/20">
              <p className="text-[9px] text-gray-500">Max Position</p>
              <p className="text-[11px] text-white font-medium">{profile.aiProfile.maxPositionPct}% of portfolio</p>
            </div>
          </div>

          {/* Rules derived */}
          <div className="pt-2 border-t border-white/[0.05]">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">AI-Derived Rules</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 rounded text-[9px] bg-black/20 text-gray-400">
                Min TVL: ${(profile.aiProfile.minProtocolTvl / 1e6).toFixed(0)}M
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] bg-black/20 text-gray-400">
                Min Age: {profile.aiProfile.minProtocolAgeDays}d
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] bg-black/20 text-gray-400">
                DeFi: {profile.summary.hasDefiActivity ? 'Active' : 'None'}
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] bg-black/20 text-gray-400">
                Bridge: {profile.summary.hasBridgeActivity ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
