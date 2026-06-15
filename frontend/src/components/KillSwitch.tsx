'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'

export function KillSwitch() {
  const { address } = useAccount()
  const [confirming, setConfirming] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revoked, setRevoked] = useState(false)

  const handleRevoke = async () => {
    if (!address) return
    setRevoking(true)

    try {
      const res = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: address }),
      })

      if (!res.ok) throw new Error(await res.text())
      setRevoked(true)
    } catch {
      // show error state
    } finally {
      setRevoking(false)
      setConfirming(false)
    }
  }

  if (revoked) {
    return (
      <div className="px-5 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 font-medium text-sm glow-red">
        All permissions revoked
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="glass border-red-500/20 p-4 space-y-3 animate-fade-in">
        <p className="text-sm text-red-300 font-medium">Revoke ALL agent permissions?</p>
        <p className="text-[11px] text-gray-500">This action is immediate and cannot be undone without re-granting.</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRevoke}
            disabled={revoking}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors glow-red"
          >
            {revoking ? 'Revoking...' : 'Confirm Revoke'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-sm transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="group relative px-5 py-3 rounded-xl bg-red-600/10 border border-red-500/30 text-red-300 font-semibold text-sm hover:bg-red-600/20 hover:border-red-500/50 transition-all duration-300"
    >
      <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 glow-red" />
      <span className="relative">Emergency: Revoke All Permissions</span>
    </button>
  )
}
