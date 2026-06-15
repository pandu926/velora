import { useState, useCallback } from 'react'
import { useAccount } from 'wagmi'

export function useKillSwitch() {
  const { address } = useAccount()
  const [isRevoked, setIsRevoked] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const revoke = useCallback(async () => {
    if (!address) return
    setIsPending(true)
    setError(null)

    try {
      const res = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAddress: address }),
      })
      if (!res.ok) throw new Error(await res.text())
      setIsRevoked(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revocation failed')
    } finally {
      setIsPending(false)
    }
  }, [address])

  return { isRevoked, isPending, error, revoke }
}
