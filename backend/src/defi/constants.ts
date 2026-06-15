// Aerodrome on Base - contract addresses
export const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as const
export const AERODROME_DEFAULT_FACTORY = '0x0000000000000000000000000000000000000000' as const

// Aave v3 on Base - contract addresses
export const AAVE_POOL = '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as const
export const AAVE_POOL_DATA_PROVIDER = '0x0F43731EB8d45A581f4a36DD74F5f358bc90C73A' as const

// Token addresses on Base
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
export const WETH_BASE = '0x4200000000000000000000000000000000000006' as const
export const cbETH_BASE = '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22' as const

export const TOKENS = [
  { symbol: 'USDC', address: USDC_BASE, decimals: 6 },
  { symbol: 'WETH', address: WETH_BASE, decimals: 18 },
  { symbol: 'cbETH', address: cbETH_BASE, decimals: 18 },
] as const
