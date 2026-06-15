'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
const ERC20_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export function useUsdcBalance() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [balance, setBalance] = useState<bigint>(0n)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address || !publicClient) {
      setBalance(0n)
      setLoading(false)
      return
    }

    let cancelled = false

    async function fetchBalance() {
      try {
        const result = await publicClient!.readContract({
          address: USDC_ADDRESS,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [address!],
        })
        if (!cancelled) setBalance(result)
      } catch {
        if (!cancelled) setBalance(0n)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchBalance()
    const interval = setInterval(fetchBalance, 15000)

    return () => { cancelled = true; clearInterval(interval) }
  }, [address, publicClient])

  const formatted = Number(balance) / 1_000_000
  return { balance, formatted, loading }
}
