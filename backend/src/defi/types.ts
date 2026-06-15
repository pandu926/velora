// --- Swap types (Aerodrome) ---

export interface SwapParams {
  tokenIn: `0x${string}`
  tokenOut: `0x${string}`
  amountIn: bigint
  slippageBps: number
  deadline: number
}

export interface SwapCalldata {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
}

export interface SwapQuote {
  amountOut: bigint
  route: AerodromeRoute[]
}

export interface AerodromeRoute {
  from: `0x${string}`
  to: `0x${string}`
  stable: boolean
  factory: `0x${string}`
}

// --- Lending types (Aave) ---

export interface LendingParams {
  token: `0x${string}`
  amount: bigint
  userAddress: `0x${string}`
}

export interface LendingResult {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
}

export interface UserAccountData {
  totalCollateralBase: bigint
  totalDebtBase: bigint
  availableBorrowsBase: bigint
  healthFactor: bigint
}

export interface ReserveData {
  liquidityRate: bigint
  variableBorrowRate: bigint
  totalAToken: bigint
}
