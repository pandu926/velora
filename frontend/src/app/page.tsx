import type { Metadata } from 'next'
import { LandingHeader, HeroSection, HowItWorks, ArchitectureDiagram, TechShowcase, OnChainProof, TrackCards, FooterCTA } from '@/components/landing/sections'

export const metadata: Metadata = {
  title: 'Velora — Autonomous DeFi Portfolio Intelligence',
  description: '9 AI agents deliberate every move through adversarial cross-examination. Autonomous strategy execution on Base via MetaMask Smart Accounts.',
}

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <LandingHeader />
      <HeroSection />
      <HowItWorks />
      <ArchitectureDiagram />
      <TechShowcase />
      <OnChainProof />
      <TrackCards />
      <FooterCTA />
    </main>
  )
}
