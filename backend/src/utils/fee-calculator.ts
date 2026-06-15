import type { FeeData } from '../services/relayer.js'

/**
 * Calculates the fee in payment token units for a given gas estimate.
 *
 * Formula: max(gasEstimate * gasPrice * rate / 1e18, minFee)
 *
 * The rate converts gas cost (in wei) to payment token units (e.g., USDC with 6 decimals).
 * The minFee ensures the relayer always receives a minimum viable payment.
 *
 * @param gasEstimate - Estimated gas units for the transaction
 * @param feeData - Fee quote from the relayer (includes rate, minFee, gasPrice)
 * @returns Fee amount in payment token's smallest unit (e.g., USDC micro-units)
 */
export function calculateFee(gasEstimate: bigint, feeData: FeeData): bigint {
  const gasCostInWei = gasEstimate * feeData.gasPrice
  const convertedFee = (gasCostInWei * feeData.rate) / BigInt(1e18)

  if (convertedFee > feeData.minFee) {
    return convertedFee
  }

  return feeData.minFee
}

/**
 * Checks whether a fee quote is still valid (not expired).
 *
 * Fee quotes from the relayer have a limited validity window.
 * Always check before submitting a transaction to avoid rejection.
 *
 * @param feeData - Fee quote from the relayer
 * @returns true if the quote is still valid
 */
export function isFeeQuoteValid(feeData: FeeData): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000)
  return feeData.expiry > nowSeconds
}

/**
 * Estimates the total cost of a transaction in human-readable token units.
 * Useful for displaying fee estimates to users before confirmation.
 *
 * @param gasEstimate - Estimated gas units
 * @param feeData - Fee quote from the relayer
 * @param tokenDecimals - Decimals of the payment token (default: 6 for USDC)
 * @returns Human-readable fee string (e.g., "0.05")
 */
export function formatFeeEstimate(
  gasEstimate: bigint,
  feeData: FeeData,
  tokenDecimals: number = 6
): string {
  const fee = calculateFee(gasEstimate, feeData)
  const divisor = BigInt(10 ** tokenDecimals)
  const whole = fee / divisor
  const fractional = fee % divisor

  const fractionalStr = fractional.toString().padStart(tokenDecimals, '0')
  return `${whole}.${fractionalStr}`
}
