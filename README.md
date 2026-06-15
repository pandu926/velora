# Velora — Autonomous DeFi Portfolio Intelligence

Velora is an autonomous DeFi agent that manages user portfolios on Base through adversarial AI consensus. Nine specialist AI models deliberate every trade decision through sequential voting and persuasion rounds, with execution handled gaslessly via ERC-7710 delegation redemption through the 1Shot Permissionless Relayer.

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

## How It Works

1. **Connect** — User connects MetaMask. Velora reads on-chain USDC balance.
2. **Authorize** — ERC-7715 `requestExecutionPermissions` grants scoped USDC budget to 1Shot's target address. MetaMask auto-upgrades EOA to Smart Account (EIP-7702).
3. **Activate** — User sets target and risk level. AI generates allocation strategy based on market conditions and wallet risk profile.
4. **Deliberate** — When opportunities arise (price movements, Fear & Greed shifts, hourly reviews), 9 agents deliberate sequentially with persuasion rounds.
5. **Execute** — Approved actions are executed gaslessly via 1Shot relayer directly from the user's smart account on Base.
6. **Monitor** — All decisions, votes, and executions are recorded and visible in the Cortex UI.

## Smart Accounts Kit Usage

### Advanced Permissions

- **Requesting Advanced Permissions (ERC-7715):** [`frontend/src/hooks/useDelegation.ts`](frontend/src/hooks/useDelegation.ts) — Calls `requestExecutionPermissions` to grant scoped USDC transfer permission to 1Shot `targetAddress`. MetaMask auto-upgrades user EOA to Smart Account via EIP-7702.

- **Redeeming Advanced Permissions (ERC-7710):** [`backend/src/services/relayer-executor.ts`](backend/src/services/relayer-executor.ts) — Decodes the `permissionContext` from ERC-7715 into delegation objects and submits to 1Shot relayer via `relayer_send7710Transaction` for on-chain execution.

### Delegations

- **Creating a delegation:** [`frontend/src/hooks/useDelegation.ts`](frontend/src/hooks/useDelegation.ts) — User grants delegation with `ERC20PeriodTransferEnforcer` caveats scoping allowed token, amount, and time period.

- **Redeeming a delegation:** [`backend/src/services/relayer-executor.ts#executeDirectViaRelayer`](backend/src/services/relayer-executor.ts) — Decodes ABI-encoded `permissionContext` into `Delegation7710` objects (delegate, delegator, authority, caveats with enforcer/terms/args, salt, signature) and submits via 1Shot `relayer_estimate7710Transaction` → `relayer_send7710Transaction` → `relayer_getStatus` poll loop.

### Redelegation

- **A2A Redelegation chain:** [`backend/src/services/a2a-coordinator.ts`](backend/src/services/a2a-coordinator.ts) — Commander agent redelegates narrowed scope to Trader agent. Two-link delegation chain (Commander → Trader → 1Shot targetAddress) redeemed in a single on-chain transaction.

## 1Shot API Usage

- **Capability discovery:** [`backend/src/services/relayer-executor.ts`](backend/src/services/relayer-executor.ts) — `relayer_getCapabilities("8453")` to get `targetAddress`, `feeCollector`, supported tokens (USDC).

- **Fee estimation:** [`backend/src/services/relayer-executor.ts#runRelayFlow`](backend/src/services/relayer-executor.ts) — `relayer_estimate7710Transaction` validates the delegation bundle and returns `requiredPaymentAmount` + signed `context`.

- **Transaction submission:** [`backend/src/services/relayer-executor.ts#runRelayFlow`](backend/src/services/relayer-executor.ts) — `relayer_send7710Transaction` with `permissionContext` (decoded delegation array), `executions` (target/value/data), and estimate `context`.

- **Status polling:** [`backend/src/services/relayer-executor.ts#runRelayFlow`](backend/src/services/relayer-executor.ts) — `relayer_getStatus` polls until status 200 (confirmed), 400 (rejected), or 500 (reverted).

- **EIP-7702 upgrade:** MetaMask handles account upgrade automatically during ERC-7715 permission grant. Wallet `0xEc08da87...` confirmed upgraded on-chain (code starts with `0xef0100`).

- **Confirmed on-chain:** Transaction confirmed on Base mainnet — 0.7 USDC transfer executed via 1Shot with 0.01 USDC fee, zero ETH gas required.

## Venice AI Usage

- **Final verdict orchestrator:** [`backend/src/court/conviction-protocol.ts`](backend/src/court/conviction-protocol.ts) — Venice AI issues the final verdict after 9 agents deliberate. Uses Venice OpenAI-compatible API for all agent reasoning calls.

- **Wallet risk profiling:** [`backend/src/services/wallet-profiler.ts`](backend/src/services/wallet-profiler.ts) — Venice AI analyzes on-chain transaction history across 4 chains (Base, Ethereum, Arbitrum, Polygon) to generate risk appetite, experience level, and recommended thresholds.

- **Strategy generation:** [`backend/src/strategy/planner.ts`](backend/src/strategy/planner.ts) — Venice AI generates allocation strategy (lending/trading/reserve percentages) based on market conditions, Fear & Greed index, and wallet profile.

- **9 specialist agents:** [`backend/src/court/boardroom-types.ts`](backend/src/court/boardroom-types.ts) — Market Analyst, Yield Researcher, Risk Officer, Sentiment Analyst, Protocol Analyst, On-Chain Analyst, Technical Auditor, Macro Analyst, Quant Strategist — all powered by Venice AI models.

- **Evidence Court:** [`backend/src/court/evidence-court.ts`](backend/src/court/evidence-court.ts) — Adversarial prosecution/defense debate where Venice AI builds cases backed by real on-chain evidence.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, Framer Motion |
| Wallet | MetaMask Smart Accounts Kit v1.5.0 (ERC-7715/7710), wagmi, viem |
| AI | Venice AI (9 diverse LLM models via OpenAI-compatible API) |
| Execution | 1Shot Permissionless Relayer, EIP-7702 Smart Accounts |
| DeFi | Aave v3 (lending), Aerodrome (swaps) on Base |
| Data | Binance WS, Pyth SSE, CoinGecko, Fear & Greed, Alchemy |
| Database | PostgreSQL + Prisma ORM |
| Deployment | PM2, Base Mainnet (Chain 8453) |

## Key Features

- **Adversarial Consensus Protocol** — 9 AI models vote sequentially. Minority agents are challenged by majority arguments across up to 4 persuasion rounds. Only strong consensus triggers execution.
- **Non-Custodial Execution** — Users delegate via ERC-7715 directly to the 1Shot relayer target. No agent private keys hold user funds. Transactions execute from the user's own smart account.
- **Gasless via 1Shot** — All transactions relayed through 1Shot Permissionless Relayer. Gas paid in USDC from delegated budget. Zero native ETH required.
- **Venice AI Orchestrator** — Venice AI powers all 9 agents and issues the final verdict on every autonomous decision.
- **Real-time Market Intelligence** — 12+ data sources: Binance WebSocket (spot + futures), Pyth SSE, CoinGecko, Fear & Greed Index, on-chain whale tracking.
- **Live Deliberation UI** — Animated agent blobs show each agent's status and reasoning in real-time. Users watch the debate unfold second by second.

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
VENICE_BASE_URL=https://api.venice.ai/api/v1

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

## Hackathon Tracks

| Track | Implementation |
|-------|---------------|
| **Best Agent** | 9 autonomous AI agents with ERC-7715 scoped permissions, adversarial consensus, real-time execution on Base mainnet |
| **Best Venice AI** | Venice AI powers all agent reasoning, final verdict orchestration, wallet profiling, and strategy generation |
| **Best 1Shot Relayer** | All execution via `relayer_send7710Transaction` — gasless ERC-7710 delegation redemption confirmed on Base mainnet |
| **Best A2A** | Agent-to-agent redelegation with narrowed scope through Commander → Trader delegation chain |

## License

MIT
