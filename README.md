# Velora — Autonomous DeFi Portfolio Intelligence

Velora is a production-grade autonomous DeFi agent that manages user portfolios on Base through adversarial AI consensus. Nine specialist AI models deliberate every trade decision through sequential voting and persuasion rounds, with execution handled gaslessly via ERC-7710 delegation redemption through the 1Shot Permissionless Relayer.

## Architecture

```
User (MetaMask) → ERC-7715 Permission Grant → 1Shot targetAddress
                                                      ↓
Real-time Feeds (Binance, Pyth, CoinGecko) → Opportunity Scanner
                                                      ↓
                                              9 AI Agents Deliberate
                                              (Sequential + Persuasion)
                                                      ↓
                                              Venice AI Final Verdict
                                                      ↓
                                    ERC-7710 Redemption via 1Shot Relayer
                                              (Gasless, USDC fee)
                                                      ↓
                                        DeFi Execution (Aave, Aerodrome)
                                              on Base Mainnet
```

## Key Features

- **Adversarial Consensus Protocol** — 9 AI models vote sequentially. Minority agents are challenged by majority arguments across up to 4 persuasion rounds. Only strong consensus triggers execution.
- **Non-Custodial Execution** — Users delegate via ERC-7715 directly to the 1Shot relayer target. No agent private keys hold user funds. Transactions execute from the user's own smart account.
- **Gasless via 1Shot** — All transactions relayed through 1Shot Permissionless Relayer. Gas paid in USDC from delegated budget. Zero native ETH required.
- **Venice AI Orchestrator** — Venice AI issues the final verdict on every autonomous decision via x402 SIWE authentication.
- **Real-time Market Intelligence** — 12+ data sources: Binance WebSocket (spot + futures), Pyth SSE, CoinGecko, Fear & Greed Index, on-chain whale tracking.
- **Live Deliberation UI** — Speech bubbles show each agent's reasoning in real-time. Users watch the debate unfold second by second.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, Framer Motion |
| Wallet | MetaMask Smart Accounts Kit (ERC-7715/7710), RainbowKit, wagmi, viem |
| AI | Venice AI (x402), 9 diverse LLM models via OpenAI-compatible API |
| Execution | 1Shot Permissionless Relayer, EIP-7702 Smart Accounts |
| DeFi | Aave v3 (lending), Aerodrome (swaps) on Base |
| Data | Binance WS, Pyth SSE, CoinGecko, Fear & Greed, Alchemy |
| Database | PostgreSQL + Prisma ORM |
| Deployment | PM2, Base Mainnet (Chain 8453) |

## How It Works

1. **Connect** — User connects MetaMask. Velora reads on-chain USDC balance.
2. **Authorize** — ERC-7715 `requestExecutionPermissions` grants scoped USDC budget to 1Shot's target address. MetaMask auto-upgrades EOA to Smart Account (EIP-7702).
3. **Activate** — User sets target and risk level. AI generates allocation strategy based on market conditions and wallet risk profile.
4. **Deliberate** — When opportunities arise (price movements, Fear & Greed shifts, hourly reviews), 9 agents deliberate sequentially with persuasion rounds.
5. **Execute** — Approved actions are executed gaslessly via 1Shot relayer directly from the user's smart account on Base.
6. **Monitor** — All decisions, votes, and executions are recorded and visible in the session history.

## Hackathon Tracks

| Track | Implementation |
|-------|---------------|
| **Best Agent** | 9 autonomous AI agents with ERC-7715 scoped permissions, adversarial consensus, real-time execution |
| **Best Venice AI** | Venice AI as final orchestrator for every autonomous decision via x402 SIWE |
| **Best 1Shot Relayer** | All execution via `relayer_send7710Transaction` — gasless ERC-7710 redemption on Base mainnet |
| **Best A2A** | Agent-to-agent redelegation with narrowed scope through the delegation chain |

## Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# Run database migrations
cd backend && npx prisma migrate dev

# Start development
pnpm dev
```

## Environment Variables

```env
# Backend
RPC_URL=https://mainnet.base.org
CHAIN_ID=8453
ONESHOT_RELAYER_URL=https://relayer.1shotapi.com/relayers
DATABASE_URL=postgresql://user:pass@localhost:5432/velora
VENICE_API_KEY=your-venice-api-key

# Frontend
BACKEND_URL=http://localhost:8930
```

## Deployment

```bash
# Build
pnpm -r build

# Start with PM2
pm2 start ecosystem.config.cjs
```

## Live Demo

**https://velora.rbexp.com**

## License

MIT
