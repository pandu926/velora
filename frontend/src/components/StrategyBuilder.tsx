'use client'

import { useState, useEffect, useCallback } from 'react'

interface StrategyRules {
  maxSpendPerTx: number
  rebalanceThreshold: number
  stopLossPercentage: number
  allowedTokens: string[]
}

const AVAILABLE_TOKENS = ['USDC', 'WETH', 'cbETH'] as const

type SaveState = 'idle' | 'saving' | 'success' | 'error'

export function StrategyBuilder() {
  const [rules, setRules] = useState<StrategyRules>({
    maxSpendPerTx: 100,
    rebalanceThreshold: 5,
    stopLossPercentage: 15,
    allowedTokens: ['USDC', 'WETH'],
  })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchStrategy = async () => {
      try {
        const res = await fetch('/api/strategy')
        if (res.ok) {
          const data = await res.json()
          if (data.rules) {
            setRules(data.rules)
          }
        }
      } catch {
        // Use defaults on fetch failure
      } finally {
        setIsLoading(false)
      }
    }
    fetchStrategy()
  }, [])

  const handleTokenToggle = useCallback((token: string) => {
    setRules(prev => {
      const hasToken = prev.allowedTokens.includes(token)
      const allowedTokens = hasToken
        ? prev.allowedTokens.filter(t => t !== token)
        : [...prev.allowedTokens, token]
      return { ...prev, allowedTokens }
    })
  }, [])

  const handleSave = async () => {
    setSaveState('saving')
    setErrorMessage(null)

    try {
      const res = await fetch('/api/strategy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules }),
      })

      if (!res.ok) {
        throw new Error(await res.text())
      }

      setSaveState('success')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch (err: unknown) {
      setSaveState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save strategy')
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-white/5 rounded-xl w-1/3" />
        <div className="h-32 bg-white/5 rounded-2xl" />
        <div className="h-32 bg-white/5 rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-white">Strategy Rules</h2>
        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">
          Auto-pilot config
        </span>
      </div>

      {/* Max Spend Per Transaction */}
      <div className="glass p-5">
        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Max Spend Per Transaction
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={10000}
            value={rules.maxSpendPerTx}
            onChange={e => setRules(prev => ({ ...prev, maxSpendPerTx: Number(e.target.value) }))}
            className="w-32 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all"
          />
          <span className="text-gray-400 text-sm font-mono">USDC</span>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Maximum amount the agent can spend in a single transaction.
        </p>
      </div>

      {/* Rebalance Threshold */}
      <div className="glass p-5">
        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Rebalance Threshold
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={20}
            value={rules.rebalanceThreshold}
            onChange={e => setRules(prev => ({ ...prev, rebalanceThreshold: Number(e.target.value) }))}
            className="flex-1"
          />
          <span className="w-14 text-right font-mono text-blue-400 text-lg font-bold">
            {rules.rebalanceThreshold}%
          </span>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Trigger rebalancing when allocation drifts beyond this threshold.
        </p>
      </div>

      {/* Stop-Loss Percentage */}
      <div className="glass p-5">
        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Stop-Loss Percentage
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={5}
            max={50}
            value={rules.stopLossPercentage}
            onChange={e => setRules(prev => ({ ...prev, stopLossPercentage: Number(e.target.value) }))}
            className="flex-1"
          />
          <span className="w-14 text-right font-mono text-red-400 text-lg font-bold">
            {rules.stopLossPercentage}%
          </span>
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          Automatically exit positions if value drops by this percentage.
        </p>
      </div>

      {/* Allowed Tokens */}
      <div className="glass p-5">
        <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Allowed Tokens
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_TOKENS.map(token => {
            const isSelected = rules.allowedTokens.includes(token)
            return (
              <button
                key={token}
                onClick={() => handleTokenToggle(token)}
                className={`px-4 py-2 rounded-xl font-mono text-sm font-medium transition-all duration-200 ${
                  isSelected
                    ? 'bg-blue-500/15 border border-blue-500/40 text-blue-300 glow-blue'
                    : 'bg-white/5 border border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300'
                }`}
              >
                {token}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-gray-500">
          The agent can only trade these tokens.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex items-center gap-4 pt-2">
        <button
          onClick={handleSave}
          disabled={saveState === 'saving'}
          className={`px-6 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
            saveState === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 glow-green'
              : saveState === 'saving'
              ? 'bg-white/5 border border-white/10 text-gray-400 cursor-wait'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/20'
          }`}
        >
          {saveState === 'idle' && 'Save Strategy'}
          {saveState === 'saving' && 'Saving...'}
          {saveState === 'success' && 'Saved'}
          {saveState === 'error' && 'Retry Save'}
        </button>
        {errorMessage && (
          <span className="text-red-400 text-xs">{errorMessage}</span>
        )}
      </div>
    </div>
  )
}
