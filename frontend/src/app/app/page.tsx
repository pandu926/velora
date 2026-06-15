'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { useDelegation } from '@/hooks/useDelegation'
import { KillSwitch } from '@/components/KillSwitch'
import { PermissionTree } from '@/components/PermissionTree'
import { AgentLeaderboard } from '@/components/AgentLeaderboard'
import { EvolutionTimeline } from '@/components/EvolutionTimeline'
import { WarRoom } from '@/components/WarRoom'
import { SessionHistory } from '@/components/SessionHistory'
import { PortfolioPanel } from '@/components/PortfolioPanel'
import { DelegationOnboarding } from '@/components/DelegationOnboarding'

type Tab = 'cortex' | 'history' | 'agents' | 'portfolio'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'cortex', label: 'Cortex', icon: 'nodes' },
  { id: 'history', label: 'History', icon: 'chart' },
  { id: 'agents', label: 'Agents', icon: 'brain' },
  { id: 'portfolio', label: 'Portfolio', icon: 'sliders' },
]

function isValidTab(t: string | null): t is Tab {
  return t !== null && TABS.some(tab => tab.id === t)
}

function TabIcon({ icon, isActive }: { icon: string; isActive: boolean }) {
  const color = isActive ? 'text-white' : 'text-gray-500'

  switch (icon) {
    case 'gavel':
      return (
        <svg className={`w-4 h-4 ${color}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
      )
    case 'brain':
      return (
        <svg className={`w-4 h-4 ${color}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm1 11a1 1 0 11-2 0 1 1 0 012 0zm0-3a1 1 0 01-2 0V7a1 1 0 112 0v3z" />
        </svg>
      )
    case 'chart':
      return (
        <svg className={`w-4 h-4 ${color}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
        </svg>
      )
    case 'sliders':
      return (
        <svg className={`w-4 h-4 ${color}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
        </svg>
      )
    case 'nodes':
      return (
        <svg className={`w-4 h-4 ${color}`} fill="currentColor" viewBox="0 0 20 20">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
      )
    default:
      return null
  }
}

export default function Home() {
  const { isConnected } = useAccount()
  const searchParams = useSearchParams()
  const router = useRouter()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<Tab>(isValidTab(tabParam) ? tabParam : 'cortex')
  const delegation = useDelegation()

  useEffect(() => {
    if (isValidTab(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    router.push(`/app?tab=${tab}`, { scroll: false })
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo — links home */}
            <Link href="/" className="w-8 h-8 rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="Velora" className="w-full h-full object-cover" />
            </Link>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight">
                <span className="text-gradient">Velora</span>
                <span className="text-white/60 ml-1.5 text-sm font-normal hidden sm:inline">DeFi Autopilot</span>
              </h1>
              <p className="text-[10px] text-gray-500 tracking-wide uppercase hidden sm:block">
                Evidence-Based Autonomous Agent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-4 sm:py-6 pb-24 md:pb-6">
        {!isConnected ? (
          /* Not Connected State */
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center max-w-md animate-fade-in">
              <div className="relative inline-flex items-center justify-center w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-20 blur-xl" />
                <div className="relative w-16 h-16 rounded-full glass flex items-center justify-center">
                  <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3 text-white">Connect Your Wallet</h2>
              <p className="text-gray-400 text-sm leading-relaxed">
                Connect with MetaMask to delegate DeFi operations to your AI agent with scoped permissions.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Tab Navigation */}
            <nav className="hidden md:flex gap-1 mb-6 p-1 glass w-fit">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => switchTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-white/10 text-white shadow-lg glow-blue'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  <TabIcon icon={tab.icon} isActive={activeTab === tab.id} />
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* Tab Content */}
            <div className="animate-fade-in" key={activeTab}>
              {activeTab === 'cortex' && (
                delegation.isLoading
                  ? <div className="flex items-center justify-center min-h-[40vh]"><div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" /></div>
                  : delegation.isGranted
                  ? <WarRoom delegationId={delegation.delegationId} />
                  : <DelegationOnboarding
                      onGrant={(amount) => delegation.grantPermissions(amount)}
                      isPending={delegation.isPending}
                      error={delegation.error}
                    />
              )}

              {activeTab === 'history' && (
                <section className="glass p-5 sm:p-6">
                  <SessionHistory />
                </section>
              )}

              {activeTab === 'portfolio' && (
                <section className="glass p-5 sm:p-6 max-w-3xl">
                  <PortfolioPanel delegation={{ isGranted: delegation.isGranted, commanderAddress: delegation.commanderAddress ?? undefined, delegationId: delegation.delegationId ?? undefined }} />
                </section>
              )}

              {activeTab === 'agents' && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                  <section className="lg:col-span-3 glass p-5 sm:p-6">
                    <AgentLeaderboard />
                  </section>
                  <aside className="lg:col-span-2 space-y-4">
                    <div className="glass p-4 sm:p-5">
                      <EvolutionTimeline />
                    </div>
                    <div className="glass p-4 sm:p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
                          Delegation Hierarchy
                        </h2>
                      </div>
                      <PermissionTree />
                    </div>
                    {delegation.isGranted && (
                      <div className="glass p-4 sm:p-5 border-red-500/10">
                        <h3 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3">Emergency Controls</h3>
                        <KillSwitch />
                      </div>
                    )}
                  </aside>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      {isConnected && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-[#0a0a0f]/90 backdrop-blur-xl">
          <div className="flex items-center justify-around py-2 px-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-gray-500'
                }`}
              >
                <TabIcon icon={tab.icon} isActive={activeTab === tab.id} />
                <span className="text-[9px] font-medium">{tab.label}</span>
                {activeTab === tab.id && (
                  <span className="w-1 h-1 rounded-full bg-blue-400 mt-0.5" />
                )}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
