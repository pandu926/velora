'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'

type DelegationState = 'idle' | 'pending' | 'granted' | 'error'

export function DelegateButton() {
  const { address } = useAccount()
  const [state, setState] = useState<DelegationState>('idle')
  const [error, setError] = useState<string | null>(null)

  const handleDelegate = async () => {
    if (!address) return
    setState('pending')
    setError(null)

    try {
      const res = await fetch('/api/delegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: address }),
      })

      if (!res.ok) throw new Error(await res.text())
      setState('granted')
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Delegation failed')
    }
  }

  return (
    <div>
      <button
        onClick={handleDelegate}
        disabled={state === 'pending'}
        className={`relative px-6 py-3 rounded-xl font-medium text-sm transition-all duration-300 ${
          state === 'granted'
            ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 glow-green cursor-default'
            : state === 'pending'
            ? 'bg-white/5 border border-white/10 text-gray-400 cursor-wait'
            : state === 'error'
            ? 'bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20'
            : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/20'
        }`}
      >
        {state === 'pending' && (
          <span className="absolute inset-0 rounded-xl border border-blue-500/50 animate-pulse" />
        )}
        <span className="relative">
          {state === 'idle' && 'Grant Permissions to Agent'}
          {state === 'pending' && 'Requesting...'}
          {state === 'granted' && 'Permissions Granted'}
          {state === 'error' && 'Retry Grant'}
        </span>
      </button>
      {error && <p className="mt-2 text-red-400 text-xs">{error}</p>}
    </div>
  )
}
