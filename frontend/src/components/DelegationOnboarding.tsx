'use client'

import { useState } from 'react'
import { useUsdcBalance } from '@/hooks/useUsdcBalance'

interface DelegationOnboardingProps {
  onGrant: (amount: number) => Promise<void>
  isPending: boolean
  error: string | null
}

export function DelegationOnboarding({ onGrant, isPending, error }: DelegationOnboardingProps) {
  const { formatted: usdcBalance, loading: balanceLoading } = useUsdcBalance()
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'intro' | 'setup'>('intro')

  const maxAmount = Math.floor(usdcBalance * 100) / 100
  const inputAmount = parseFloat(amount) || 0
  const isValid = inputAmount > 0 && inputAmount <= maxAmount

  function handleMax() {
    setAmount(maxAmount.toString())
  }

  async function handleGrant() {
    if (!isValid) return
    await onGrant(inputAmount)
  }

  if (step === 'intro') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-white mb-3">Welcome to Velora</h2>
            <p className="text-sm text-white/40 leading-relaxed max-w-md mx-auto">
              Your autonomous DeFi agent. Set a budget, define your risk — AI handles the rest.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <h3 className="text-xs font-semibold text-white mb-1">Scoped Permissions</h3>
              <p className="text-[10px] text-white/30 leading-relaxed">Agent can only use what you allow. Revoke instantly.</p>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
              </div>
              <h3 className="text-xs font-semibold text-white mb-1">9 AI Agents</h3>
              <p className="text-[10px] text-white/30 leading-relaxed">Every decision debated adversarially. Only convictions execute.</p>
            </div>

            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
              </div>
              <h3 className="text-xs font-semibold text-white mb-1">Gasless Execution</h3>
              <p className="text-[10px] text-white/30 leading-relaxed">All transactions via 1Shot Relayer. Zero gas fees.</p>
            </div>
          </div>

          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.06]">
              <span className="text-[10px] text-white/40 uppercase tracking-wider">Your balance</span>
              <span className="text-sm font-semibold text-white">{balanceLoading ? '...' : `$${usdcBalance.toFixed(2)} USDC`}</span>
            </div>
          </div>

          <button
            onClick={() => setStep('setup')}
            className="w-full py-3.5 rounded-xl font-medium text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 transition-all duration-300"
          >
            Get Started
          </button>

          <div className="flex items-center justify-center gap-6 mt-6 text-[10px] text-white/20">
            <span>MetaMask Smart Accounts</span>
            <span className="w-1 h-1 rounded-full bg-white/10" />
            <span>Venice AI</span>
            <span className="w-1 h-1 rounded-full bg-white/10" />
            <span>1Shot Relayer</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="p-8 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-[10px] text-emerald-400 font-bold">1</span>
              <span className="text-[10px] text-emerald-400 font-medium">Connect</span>
            </div>
            <div className="w-8 h-px bg-emerald-500/30" />
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-[10px] text-blue-400 font-bold">2</span>
              <span className="text-[10px] text-blue-400 font-medium">Authorize</span>
            </div>
            <div className="w-8 h-px bg-white/10" />
            <div className="flex items-center gap-1.5">
              <span className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-gray-500 font-bold">3</span>
              <span className="text-[10px] text-gray-500 font-medium">Activate</span>
            </div>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Set Agent Budget</h2>
          <p className="text-sm text-white/40 leading-relaxed">
            Choose how much USDC the agent can manage. This is a hard cap — the agent cannot exceed it.
          </p>
        </div>

        <div className="space-y-5">
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <span className="text-xs text-white/40 uppercase tracking-wider">Available USDC</span>
            <span className="text-sm font-semibold text-white">
              {balanceLoading ? '...' : `$${usdcBalance.toFixed(2)}`}
            </span>
          </div>

          <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-2">
              Agent Budget
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                max={maxAmount}
                step="0.01"
                className="w-full px-4 py-3 pr-16 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 transition-colors"
              />
              <button
                onClick={handleMax}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 rounded-lg text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors"
              >
                Max
              </button>
            </div>
            {inputAmount > maxAmount && (
              <p className="mt-1.5 text-[11px] text-red-400">Exceeds your balance</p>
            )}
          </div>

          {isValid && (
            <div className="px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Agent budget</span>
                <span className="text-white">${inputAmount.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Period limit</span>
                <span className="text-white">${inputAmount.toFixed(2)} / 24h</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Expires</span>
                <span className="text-white">7 days</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/40">Revocable</span>
                <span className="text-emerald-400">Instant kill-switch</span>
              </div>
            </div>
          )}

          <button
            onClick={handleGrant}
            disabled={!isValid || isPending}
            className={`w-full py-3.5 rounded-xl font-medium text-sm transition-all duration-300 ${
              isPending
                ? 'bg-white/5 border border-white/10 text-gray-400 cursor-wait'
                : isValid
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20'
                : 'bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isPending ? 'Confirm in MetaMask...' : 'Authorize Agent'}
          </button>

          {error && (
            <p className="text-center text-xs text-red-400">{error}</p>
          )}

          <button
            onClick={() => setStep('intro')}
            className="w-full text-center text-[11px] text-white/25 hover:text-white/40 transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  )
}
