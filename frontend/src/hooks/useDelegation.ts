'use client'

import { useState, useCallback, useEffect } from 'react'
import { useAccount, useWalletClient } from 'wagmi'

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
const BASE_CHAIN_ID = 8453
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60

interface DelegationState {
  isGranted: boolean
  isPending: boolean
  isLoading: boolean
  error: string | null
  commanderAddress: string | null
  delegationId: string | null
}

export function useDelegation() {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [state, setState] = useState<DelegationState>({
    isGranted: false,
    isPending: false,
    isLoading: true,
    error: null,
    commanderAddress: null,
    delegationId: null,
  })

  // Rehydrate delegation state on wallet connect
  useEffect(() => {
    if (!address) {
      setState(s => ({ ...s, isLoading: false, isGranted: false, delegationId: null, commanderAddress: null }))
      return
    }

    async function checkExisting() {
      try {
        const r = await fetch(`/api/delegate/${address}`)
        if (!r.ok) { setState(s => ({ ...s, isLoading: false })); return }
        const json = await r.json()
        const root = json.data?.root ?? json.root
        if (root && !root.revoked) {
          setState({
            isGranted: true,
            isPending: false,
            isLoading: false,
            error: null,
            commanderAddress: root.delegate ?? null,
            delegationId: root.id ?? null,
          })
        } else {
          setState(s => ({ ...s, isLoading: false }))
        }
      } catch {
        setState(s => ({ ...s, isLoading: false }))
      }
    }

    checkExisting()
  }, [address])

  const grantPermissions = useCallback(async (maxUsdc: number = 100) => {
    if (!walletClient || !address) {
      setState(s => ({ ...s, error: 'Wallet not connected' }))
      return
    }

    setState(s => ({ ...s, isPending: true, error: null }))

    try {
      // Fetch 1Shot relayer targetAddress — this is what user delegates TO
      const targetRes = await fetch('/api/delegate/target-address')
      if (!targetRes.ok) throw new Error('Failed to get relayer target address')
      const { targetAddress } = await targetRes.json()

      const expiry = Math.floor(Date.now() / 1000) + SEVEN_DAYS_SECONDS
      const periodAmount = BigInt(maxUsdc) * 1_000_000n

      // ERC-7715: request execution permissions — MetaMask handles 7702 upgrade
      const { erc7715ProviderActions } = await import('@metamask/smart-accounts-kit/actions')
      const extendedClient = walletClient.extend(erc7715ProviderActions())

      const permissions = await (extendedClient as any).requestExecutionPermissions([{
        chainId: BASE_CHAIN_ID,
        to: targetAddress,
        expiry,
        permission: {
          type: 'erc20-token-periodic',
          data: {
            tokenAddress: USDC_ADDRESS,
            periodAmount,
            periodDuration: 86400,
            justification: `Autonomous DeFi management up to ${maxUsdc} USDC per day`,
          },
          isAdjustmentAllowed: false,
        },
      }])

      const permissionContext = permissions[0].context
      const delegationManager = permissions[0].delegationManager

      // Store in backend
      const res = await fetch('/api/delegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          permissionContext,
          delegationManager,
          maxUsdc: maxUsdc.toString(),
          expiry,
        }),
      })
      if (!res.ok) throw new Error(await res.text())

      const json = await res.json()
      const data = json.data ?? json

      setState({
        isGranted: true,
        isPending: false,
        isLoading: false,
        error: null,
        commanderAddress: targetAddress,
        delegationId: data.delegationId ?? null,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Permission request failed'
      setState(s => ({
        ...s,
        isPending: false,
        error: message.includes('METHOD_NOT_FOUND') || message.includes('not supported')
          ? 'MetaMask v13.23+ required. Please update your wallet.'
          : message,
      }))
    }
  }, [walletClient, address])

  const revokePermissions = useCallback(async () => {
    if (!address) return
    await fetch('/api/kill-switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAddress: address }),
    })
    setState({
      isGranted: false,
      isPending: false,
      isLoading: false,
      error: null,
      commanderAddress: null,
      delegationId: null,
    })
  }, [address])

  return { ...state, grantPermissions, revokePermissions }
}
