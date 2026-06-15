# Velora Demo Video Script — 3 Minutes

## Overview
- Language: Indonesian + English (technical terms in English)
- Tone: Confident, technical but accessible
- Goal: Judges understand the problem, solution, tech depth, and are impressed by the UX simplicity hiding backend complexity

---

## [0:00 - 0:20] HOOK — The Problem

**Visual:** Dark screen, text overlay animasi

**Narasi (ID):**
"DeFi itu 24/7. Market bergerak saat kamu tidur. Satu momen missed bisa berarti ribuan dollar hilang. Tapi siapa yang mau duduk di depan layar nonstop? Bagaimana kalau ada AI yang bisa manage portfolio kamu — tapi kamu tetap pegang kendali penuh?"

**Text overlay:**
"The Problem: DeFi never sleeps. You do."

---

## [0:20 - 0:45] SOLUTION — What is Velora

**Visual:** Landing page velora.rbexp.com, scroll smooth

**Narasi (ID + EN):**
"Velora adalah autonomous DeFi agent. Bukan satu AI — tapi 9 specialist AI agents yang deliberate setiap keputusan secara adversarial. Market Analyst, Risk Officer, Yield Researcher — mereka berdebat seperti rapat direksi sebelum satu sen pun bergerak."

"And the best part — everything runs from YOUR wallet. No custodial risk. No separate agent wallets. Your funds stay yours."

**Text overlay:**
"9 AI Agents. 1 Decision. Your Wallet."

---

## [0:45 - 1:10] TECH ARCHITECTURE — How It Works

**Visual:** Architecture diagram di landing page, kemudian switch ke app view

**Narasi (EN — technical):**
"Here's what's happening under the hood:"

"Step one — ERC-7715. The user grants scoped permissions directly to the 1Shot Relayer's target address via MetaMask. MetaMask automatically upgrades the user's EOA to a Smart Account via EIP-7702. No separate agent wallet needed."

"Step two — the AI layer. Nine different LLM models deliberate every opportunity. They vote sequentially. The minority gets challenged by the majority. Agents can flip their vote. Only when 8 out of 9 agree does execution proceed."

"Step three — ERC-7710 redemption via 1Shot Permissionless Relayer. Gasless. Fee paid in USDC from the user's delegated budget. The transaction executes directly from the user's smart account on Base."

**Text overlay (berurutan):**
- "ERC-7715 → Scoped Delegation"
- "9 AI Models → Adversarial Consensus"  
- "ERC-7710 + 1Shot → Gasless Execution"

---

## [1:10 - 1:50] LIVE DEMO — The App in Action

**Visual:** Screen recording of velora.rbexp.com/app

**Narasi (ID):**
"Mari kita lihat langsung."

[Show: Connect wallet]
"User connect MetaMask. Velora langsung baca saldo USDC on-chain."

[Show: Authorize — MetaMask popup]
"Satu klik authorize. MetaMask menampilkan permission request yang jelas — berapa USDC, berapa lama, bisa revoke kapan saja."

[Show: Set target + Activate Autopilot]
"User set target dan risk level. Klik activate."

[Show: Agents deliberating — bubbles appearing one by one]
"Dalam hitungan detik — 9 agents mulai bicara. Setiap agent punya speech bubble yang menunjukkan reasoning mereka. Market Analyst bilang YES karena APY. Risk Officer bilang NO karena smart contract risk."

[Show: Persuasion round — minority gets challenged]
"Round 2 — majority mempersuasi minority. Lihat — Risk Officer flip ke YES setelah menerima argumen dari 6 agent lain."

[Show: Venice AI verdict]
"Venice AI sebagai orchestrator memberikan final verdict."

[Show: Execution + basescan link]
"APPROVED. 1Shot relayer execute langsung dari smart account user. Zero gas. Ini transaction hash-nya di BaseScan — real, on-chain, verified."

---

## [1:50 - 2:20] INNOVATION — What Makes This Different

**Visual:** Split screen — left: simple UI, right: code/architecture

**Narasi (EN):**
"What makes Velora different from other DeFi agents?"

"One — True adversarial consensus. Not majority voting. Agents challenge each other. Minority agents get persuaded or hold their ground. Up to 4 rounds of deliberation."

"Two — No custodial risk. Zero agent private keys holding user funds. The user delegates directly to the 1Shot relayer via ERC-7715. Execution happens from the user's own smart account."

"Three — Production AI infrastructure. Real-time feeds from Binance, Pyth, CoinGecko. Fear & Greed index. 12 market data sources feeding into every decision. Venice AI as the final arbiter via x402 payment protocol."

"Four — Beautiful UX hiding extreme complexity. The user sees a clean interface with agents talking. Behind it: 28+ AI calls per deliberation, delegation chains, on-chain execution, gasless relay."

**Text overlay:**
- "Adversarial Consensus (not voting)"
- "Non-custodial (ERC-7715 → 7710)"
- "12 real-time data sources"
- "Simple UX, complex backend"

---

## [2:20 - 2:50] TRACK QUALIFICATION

**Visual:** App showing various features, badges

**Narasi (EN):**
"Velora qualifies for multiple tracks:"

"Best Agent — 9 autonomous AI agents operating with scoped MetaMask Advanced Permissions. Every decision is adversarial, evidence-based, and recorded on-chain."

"Best Venice AI — Venice is the orchestrator. Every final verdict passes through Venice via x402 SIWE authentication. Venice is central to every autonomous decision."

"Best 1Shot Relayer — All execution goes through 1Shot's permissionless relayer on Base mainnet. ERC-7710 redemption, gasless, USDC fee payment."

"Best A2A — True agent-to-agent coordination via redelegation. The system redelegates user permissions through multiple AI agents, each with narrowed scope."

---

## [2:50 - 3:00] CLOSING

**Visual:** Landing page hero section

**Narasi (ID):**
"Velora. Set your target. Let the agents work. Your money, your wallet, their intelligence."

**Text overlay:**
"velora.rbexp.com"
"Built with MetaMask Smart Accounts Kit + Venice AI + 1Shot Relayer on Base"

---

## Production Notes

- Record at 1080p minimum, 60fps preferred
- Use screen recording with smooth scrolling
- Add subtle background music (electronic/ambient)
- Text overlays: clean sans-serif, fade in/out
- Transitions: simple dissolve between sections
- Show real data (live prices, real MetaMask popup, real basescan tx)
- No fake mockups — everything shown must be from the live production app
