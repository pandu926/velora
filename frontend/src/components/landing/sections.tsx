'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useScroll, useTransform, useInView } from 'framer-motion'
import Link from 'next/link'

const ACCENT = {
  primary: '#10b981',
  glow: 'rgba(16, 185, 129, 0.15)',
  border: 'rgba(16, 185, 129, 0.2)',
  text: '#6ee7b7',
  gradient: 'from-emerald-400 to-teal-400',
}

function AnimatedText({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <span className="inline-block overflow-hidden">
      <motion.span
        className="inline-block"
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: '0%', opacity: 1 }}
        transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      >
        {text}
      </motion.span>
    </span>
  )
}

function ParticleField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: 40 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-[2px] h-[2px] rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            background: i % 3 === 0 ? ACCENT.primary : 'rgba(255,255,255,0.15)',
          }}
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0, 1, 0],
          }}
          transition={{
            duration: 3 + Math.random() * 4,
            repeat: Infinity,
            delay: Math.random() * 5,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

function GridLines() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-[0.03]">
      <div className="absolute inset-0" style={{
        backgroundImage: `
          linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
        `,
        backgroundSize: '80px 80px',
      }} />
    </div>
  )
}

function OrbitalRing({ size, duration, delay = 0 }: { size: number; duration: number; delay?: number }) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 rounded-full border"
      style={{
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderColor: ACCENT.border,
      }}
      animate={{ rotate: 360 }}
      transition={{ duration, repeat: Infinity, ease: 'linear', delay }}
    >
      <motion.div
        className="absolute w-2 h-2 rounded-full"
        style={{ background: ACCENT.primary, top: -4, left: '50%', marginLeft: -4 }}
        animate={{ opacity: [0.4, 1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
    </motion.div>
  )
}

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-[#030305]/80 backdrop-blur-2xl border-b border-white/[0.04]' : ''}`}>
      <div className="max-w-7xl mx-auto px-8 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Velora" className="w-8 h-8 rounded-lg" />
          <span className="text-[15px] font-semibold text-white tracking-tight">Velora</span>
        </div>
        <nav className="hidden md:flex items-center gap-10 text-[13px] text-white/40 font-medium">
          <a href="#protocol" className="hover:text-white transition-colors duration-300">Protocol</a>
          <a href="#architecture" className="hover:text-white transition-colors duration-300">Architecture</a>
          <a href="#agents" className="hover:text-white transition-colors duration-300">Agents</a>
          <a href="#proof" className="hover:text-white transition-colors duration-300">On-Chain</a>
        </nav>
        <Link href="/app" className="px-5 py-2.5 rounded-full text-[13px] font-semibold text-black bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30">
          Launch App
        </Link>
      </div>
    </header>
  )
}

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-[#030305]">
      <ParticleField />
      <GridLines />

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <OrbitalRing size={400} duration={30} />
        <OrbitalRing size={550} duration={45} delay={2} />
        <OrbitalRing size={700} duration={60} delay={4} />
      </div>

      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full" style={{ background: `radial-gradient(circle, ${ACCENT.glow} 0%, transparent 70%)` }} />

      <div className="relative z-10 max-w-5xl mx-auto text-center px-6 pt-20">
        <h1 className="text-[clamp(3rem,8vw,6.5rem)] font-bold leading-[0.95] tracking-[-0.04em]">
          <AnimatedText text="Autonomous" delay={0.3} />
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-200 to-emerald-400">
            <AnimatedText text="DeFi Intelligence" delay={0.5} />
          </span>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="mt-8 text-[18px] sm:text-[20px] text-white/40 max-w-2xl mx-auto leading-relaxed font-light"
        >
          9 AI agents deliberate every trade through adversarial cross-examination.
          Only convictions that survive scrutiny execute on-chain.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.2 }}
          className="flex items-center justify-center gap-5 mt-12"
        >
          <Link href="/app" className="group relative px-8 py-4 rounded-full text-[14px] font-semibold text-black bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition-all shadow-2xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5">
            Enter the Cortex
            <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <a href="#protocol" className="px-8 py-4 rounded-full text-[14px] font-medium text-white/60 border border-white/[0.08] hover:border-white/20 hover:text-white/80 transition-all hover:bg-white/[0.02]">
            How It Works
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.6 }}
          className="grid grid-cols-3 gap-12 mt-24 max-w-xl mx-auto"
        >
          {[
            { value: '9', label: 'AI Agents' },
            { value: '$0', label: 'Gas Cost' },
            { value: '24/7', label: 'Autonomous' },
          ].map((stat, i) => (
            <div key={i} className="text-center">
              <p className="text-3xl sm:text-4xl font-bold text-white tracking-tight">{stat.value}</p>
              <p className="text-[11px] text-white/30 mt-2 uppercase tracking-[0.15em] font-medium">{stat.label}</p>
            </div>
          ))}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5 }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="w-[1px] h-12 bg-gradient-to-b from-transparent via-emerald-400/40 to-transparent"
        />
      </motion.div>
    </section>
  )
}

export function HowItWorks() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  const steps = [
    { num: '01', title: 'Detect', desc: 'Real-time WebSocket feeds from Binance, Alchemy, Pyth scan for opportunities 24/7.' },
    { num: '02', title: 'Deliberate', desc: '9 AI agents take blind stances independently — no groupthink, pure conviction.' },
    { num: '03', title: 'Challenge', desc: 'Adversarial cross-examination. Weak arguments collapse under pressure.' },
    { num: '04', title: 'Execute', desc: 'Surviving convictions trigger gasless execution via 1Shot on Base.' },
  ]

  return (
    <section id="protocol" className="relative py-40 px-6 bg-[#030305]" ref={ref}>
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <p className="text-[11px] uppercase tracking-[0.3em] font-medium mb-4" style={{ color: ACCENT.text }}>Protocol</p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-bold text-white tracking-tight leading-[1.1]">
            Not voting.<br />
            <span className="text-white/40">Survival of argument.</span>
          </h2>
        </motion.div>

        <div className="mt-20 space-y-0">
          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.15 }}
              className="group flex items-start gap-8 py-10 border-b border-white/[0.04] hover:border-emerald-500/20 transition-colors duration-500"
            >
              <span className="text-[11px] font-mono text-white/20 mt-1 shrink-0">{step.num}</span>
              <div className="flex-1">
                <h3 className="text-2xl font-semibold text-white group-hover:text-emerald-300 transition-colors duration-300">{step.title}</h3>
                <p className="text-[15px] text-white/35 mt-2 leading-relaxed max-w-lg">{step.desc}</p>
              </div>
              <div className="w-8 h-8 rounded-full border border-white/[0.06] group-hover:border-emerald-500/30 flex items-center justify-center transition-all duration-300 shrink-0 mt-1">
                <motion.span
                  className="text-white/20 group-hover:text-emerald-400 text-sm transition-colors"
                  whileHover={{ x: 3 }}
                >→</motion.span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function ArchitectureDiagram() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  const layers = [
    { label: 'Data Layer', items: ['Binance WS', 'Alchemy WS', 'Pyth SSE', 'Fear & Greed'], color: 'emerald' },
    { label: 'Intelligence', items: ['Opportunity Scanner', 'Strategy Planner', 'Money Manager'], color: 'teal' },
    { label: 'Consensus', items: ['9-Agent Blind Stance', 'Cross-Examination', 'Conviction Lock'], color: 'cyan' },
    { label: 'Execution', items: ['1Shot Relayer', 'EIP-7702', 'Gasless on Base'], color: 'emerald' },
  ]

  return (
    <section id="architecture" className="relative py-40 px-6 bg-[#030305]" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <p className="text-[11px] uppercase tracking-[0.3em] font-medium mb-4" style={{ color: ACCENT.text }}>Architecture</p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-bold text-white tracking-tight">
            Built for autonomy.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {layers.map((layer, i) => (
            <motion.div
              key={layer.label}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.1 }}
              className="group p-8 rounded-2xl border border-white/[0.04] bg-white/[0.01] hover:border-emerald-500/20 hover:bg-emerald-500/[0.02] transition-all duration-500"
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-2 h-2 rounded-full bg-emerald-400/60" />
                <span className="text-[12px] uppercase tracking-[0.2em] text-white/50 font-medium">{layer.label}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {layer.items.map((item) => (
                  <span key={item} className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-white/50 bg-white/[0.03] border border-white/[0.05] group-hover:text-emerald-300/70 group-hover:border-emerald-500/10 transition-colors duration-300">
                    {item}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function TechShowcase() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  const cards = [
    { title: 'Adversarial Conviction', desc: 'Not voting. Survival of argument through cross-examination.', metric: '3 agents flipped after challenge' },
    { title: 'Emergent Economy', desc: 'Reputation earned, not assigned. Natural selection replaces failures.', metric: 'Bottom 2 replaced every 30 sessions' },
    { title: 'Autonomous Strategy', desc: 'Set target. Agent handles the rest. 24/7 scanning and execution.', metric: '5 real-time feeds, zero downtime' },
  ]

  return (
    <section id="agents" className="relative py-40 px-6 bg-[#030305]" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <p className="text-[11px] uppercase tracking-[0.3em] font-medium mb-4" style={{ color: ACCENT.text }}>Innovation</p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-bold text-white tracking-tight">
            Three breakthroughs.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card, i) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.12 }}
              className="group p-8 rounded-2xl border border-white/[0.04] bg-white/[0.01] hover:border-emerald-500/20 transition-all duration-500 flex flex-col"
            >
              <h3 className="text-lg font-semibold text-white group-hover:text-emerald-300 transition-colors duration-300">{card.title}</h3>
              <p className="text-[14px] text-white/30 mt-3 leading-relaxed flex-1">{card.desc}</p>
              <p className="text-[11px] text-emerald-400/60 mt-6 font-mono">{card.metric}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function OnChainProof() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section id="proof" className="relative py-40 px-6 bg-[#030305]" ref={ref}>
      <div className="max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <p className="text-[11px] uppercase tracking-[0.3em] font-medium mb-4" style={{ color: ACCENT.text }}>Verified</p>
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-bold text-white tracking-tight">
            On-chain. Transparent. Auditable.
          </h2>
          <p className="mt-6 text-white/30 text-lg max-w-xl mx-auto">Every agent decision, reputation score, and execution is recorded on Base mainnet.</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 p-8 rounded-2xl border border-white/[0.04] bg-white/[0.01]"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              { label: 'Network', value: 'Base (8453)' },
              { label: 'Contract', value: 'VeloraReputation SBT' },
              { label: 'Gas', value: '$0 (1Shot Relayer)' },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <p className="text-[11px] text-white/30 uppercase tracking-[0.15em]">{item.label}</p>
                <p className="text-[14px] text-white/70 mt-2 font-medium">{item.value}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

export function TrackCards() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  const capabilities = [
    { title: 'Delegated Execution', desc: 'ERC-7715 scoped permissions with ERC-7710 on-chain redemption. Users set boundaries, agents operate within them.', tag: 'Smart Accounts' },
    { title: 'AI-Driven Decisions', desc: 'Venice AI synthesizes adversarial debate from 9 specialist models into a single conviction-weighted verdict.', tag: 'Venice x402' },
    { title: 'Gasless Settlement', desc: 'Every transaction relayed via 1Shot permissionless relayer. Zero native gas. Fees paid in USDC from delegated funds.', tag: '1Shot Relay' },
  ]

  return (
    <section className="relative py-40 px-6 bg-[#030305]" ref={ref}>
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-16"
        >
          <p className="text-[11px] uppercase tracking-[0.3em] font-medium mb-4" style={{ color: ACCENT.text }}>Technology</p>
          <h2 className="text-[clamp(2rem,5vw,3rem)] font-bold text-white tracking-tight">
            Production-grade infrastructure.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.3 + i * 0.1 }}
              className="p-8 rounded-2xl border border-white/[0.04] bg-white/[0.01] hover:border-emerald-500/20 transition-all duration-500 flex flex-col"
            >
              <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-emerald-400/60 mb-4">{cap.tag}</span>
              <h3 className="text-lg font-semibold text-white">{cap.title}</h3>
              <p className="text-[13px] text-white/30 mt-3 leading-relaxed flex-1">{cap.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function FooterCTA() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <section className="relative py-40 px-6 bg-[#030305]" ref={ref}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 50%, ${ACCENT.glow} 0%, transparent 60%)` }} />

      <div className="relative max-w-3xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-[clamp(2.5rem,6vw,4.5rem)] font-bold text-white tracking-tight leading-[1]">
            Ready to see<br />autonomous DeFi?
          </h2>
          <p className="mt-6 text-white/30 text-lg">Set your target. Let the agents work.</p>

          <Link href="/app" className="inline-flex items-center gap-2 mt-12 px-10 py-5 rounded-full text-[15px] font-semibold text-black bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 transition-all shadow-2xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5">
            Enter the Cortex
            <span>→</span>
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="flex items-center justify-center gap-8 mt-16 text-[11px] text-white/20 font-medium"
        >
          <span>MetaMask Smart Accounts</span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
          <span>Venice AI</span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
          <span>1Shot Relayer</span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
          <span>Base</span>
        </motion.div>
      </div>
    </section>
  )
}
