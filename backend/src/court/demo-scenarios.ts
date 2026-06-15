export interface DemoScenario {
  id: string
  title: string
  proposal: string
  risk: 'low' | 'medium' | 'high'
  expectedOutcome: string
}

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'aave-supply',
    title: 'Supply USDC to Aave',
    proposal: 'Supply 500 USDC (27% of USDC holdings) to Aave v3 on Base at ~3.2% APY. Aave is battle-tested with $500M+ TVL on Base. Position is withdrawable anytime.',
    risk: 'low',
    expectedOutcome: 'Likely approved — low risk, established protocol',
  },
  {
    id: 'eth-swap-large',
    title: 'Swap 80% USDC to ETH',
    proposal: 'Swap 800 USDC (80% of stablecoin holdings) to ETH at current market price via Aerodrome. This is a concentrated directional bet on ETH price appreciation.',
    risk: 'high',
    expectedOutcome: 'Likely rejected — large position, directional risk',
  },
  {
    id: 'new-protocol-yield',
    title: 'Farm on unaudited protocol',
    proposal: 'Deposit 600 USDC into MorphoVault-X (launched 2 weeks ago, no audit, 12% APY advertised). Higher yield than Aave but protocol is new and unproven.',
    risk: 'high',
    expectedOutcome: 'Likely rejected — unaudited, smart contract risk',
  },
  {
    id: 'small-rebalance',
    title: 'Rebalance 5% to ETH',
    proposal: 'Swap 50 USDC (5% of stablecoins) to ETH to maintain 60/40 USDC/ETH target allocation. Small rebalance to stay within strategy bounds.',
    risk: 'low',
    expectedOutcome: 'Likely approved — small size, within strategy',
  },
  {
    id: 'leverage-loop',
    title: 'Leverage loop ETH 3x',
    proposal: 'Supply ETH to Aave, borrow USDC, buy more ETH, re-supply. Target 3x leverage on ETH position. Liquidation risk at ETH -25%.',
    risk: 'high',
    expectedOutcome: 'Likely rejected — high leverage, liquidation risk',
  },
  {
    id: 'withdraw-all',
    title: 'Emergency withdraw all positions',
    proposal: 'Withdraw all supplied USDC from Aave and hold 100% in wallet. Reasoning: macro uncertainty and potential smart contract vulnerability reported on Twitter.',
    risk: 'medium',
    expectedOutcome: 'Mixed — depends on evidence quality for the threat',
  },
]
