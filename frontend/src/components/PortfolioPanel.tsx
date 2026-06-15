'use client'

import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'

interface DelegationInfo {
  isGranted: boolean
  commanderAddress?: string
  delegationId?: string
}

interface StrategyData {
  targetValue: number
  currentValue: number
  riskLevel: string
  allocations: Array<{ type: string; percentage: number; protocol: string }>
}

export function PortfolioPanel({ delegation }: { delegation: DelegationInfo }) {
  const { address, isConnected } = useAccount()
  const { formatted: usdcBalance, loading: balanceLoading } = useUsdcBalance()
  const [strategy, setStrategy] = useState<StrategyData | null>(null)
  const [status, setStatus] = useState<string>('idle')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address) { setLoading(false); return }
    fetchData()
    const i = setInterval(fetchData, 10000)
    return () => clearInterval(i)
  }, [address])

  async function fetchData() {
    try {
      const r = await fetch(`/api/autonomous/status?user=${address}`)
      if (!r.ok) return
      const d = await r.json()
      setStatus(d.status || 'idle')
      if (d.config && d.plan) {
        setStrategy({
          targetValue: d.config.targetValue,
          currentValue: d.config.currentValue,
          riskLevel: d.config.riskLevel,
          allocations: d.plan.allocations || [],
        })
      }
    } catch {} finally { setLoading(false) }
  }

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />)}</div>
  }

  const isActive = status !== 'idle' && status !== 'stopped'

  return (
    <div className="space-y-5">
      {/* Wallet Info */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Wallet</span>
            {isConnected && address ? (
              <p className="text-sm text-white font-mono mt-0.5">{address.slice(0, 8)}...{address.slice(-6)}</p>
            ) : (
              <p className="text-sm text-gray-400 mt-0.5">Not connected</p>
            )}
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Network</span>
            <p className="text-sm text-white mt-0.5">Base Mainnet</p>
          </div>
        </div>
      </div>

      {/* USDC Balance (real on-chain) */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">USDC Balance</span>
            <p className="text-xl font-bold font-mono text-white mt-1">
              {balanceLoading ? '...' : `$${usdcBalance.toFixed(2)}`}
            </p>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">Status</span>
            <p className={`text-sm mt-0.5 font-medium ${isActive ? 'text-emerald-400' : 'text-gray-400'}`}>
              {isActive ? 'Autopilot Active' : 'Idle'}
            </p>
          </div>
        </div>
      </div>

      {/* Delegation Status */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Delegation</span>
        <div className="flex items-center gap-3 mt-2">
          <span className={`w-2 h-2 rounded-full ${delegation.isGranted ? 'bg-emerald-400' : 'bg-gray-600'}`} />
          <span className={`text-sm ${delegation.isGranted ? 'text-emerald-400' : 'text-gray-400'}`}>
            {delegation.isGranted ? 'Active — Agent authorized' : 'Not delegated'}
          </span>
        </div>
        {delegation.isGranted && delegation.commanderAddress && (
          <div className="mt-2 space-y-1 text-[10px] font-mono">
            <p className="text-gray-500">Commander: <span className="text-gray-300">{delegation.commanderAddress.slice(0, 12)}...{delegation.commanderAddress.slice(-6)}</span></p>
            {delegation.delegationId && <p className="text-gray-500">Delegation: <span className="text-gray-300">{delegation.delegationId.slice(0, 16)}...</span></p>}
          </div>
        )}
      </div>

      {/* Strategy (only when active) */}
      {strategy && isActive ? (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider">Active Strategy</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm text-white font-mono">${strategy.currentValue} → ${strategy.targetValue}</span>
            <span className="text-[10px] text-gray-400 capitalize">{strategy.riskLevel} risk</span>
          </div>
          {strategy.allocations.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {strategy.allocations.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-400 capitalize">{a.type}</span>
                  <span className="text-white font-mono">{a.percentage}% via {a.protocol}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 text-center">
          <p className="text-sm text-gray-400">No active strategy</p>
          <p className="text-[10px] text-gray-600 mt-1">Start autopilot in Cortex tab to begin</p>
        </div>
      )}

      {/* On-chain info */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">Integration</span>
        <div className="space-y-2 mt-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-400">Delegation (ERC-7710)</span>
            <span className={delegation.isGranted ? 'text-emerald-400' : 'text-gray-600'}>{delegation.isGranted ? 'Active' : 'Not granted'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-400">Execution</span>
            <span className="text-gray-300">1Shot Relayer (Gasless)</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-gray-400">Chain</span>
            <span className="text-white">Base (8453)</span>
          </div>
        </div>
      </div>
    </div>
  )
}
