import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { RiskRegistry } from "@/clients/generated/accounts/riskRegistry"
import type { RiskPair } from "@/clients/generated/types/riskPair"

/**
 * Convert basis points to decimal
 *
 * @param bps - Basis points (e.g., 9300 = 93%)
 * @returns Decimal value (e.g., 0.93)
 */
export function bpsToDecimal(bps: number): number {
  return bps / 10000
}

/**
 * Convert decimal to basis points
 *
 * @param decimal - Decimal value (e.g., 0.93)
 * @returns Basis points (e.g., 9300)
 */
export function decimalToBps(decimal: number): number {
  return Math.round(decimal * 10000)
}

/**
 * Get the risk pair for two tokens from the on-chain RiskRegistry
 *
 * @param depositMint - Mint address of the deposit asset
 * @param borrowMint - Mint address of the borrow asset
 * @param assetRegistry - AssetRegistry account (for mint → index mapping)
 * @param riskRegistry - RiskRegistry account (contains risk pairs matrix)
 * @returns RiskPair if found, null otherwise
 */
export function getRiskPairForTokens(
  depositMint: string,
  borrowMint: string,
  assetRegistry: AssetRegistry | null,
  riskRegistry: null | RiskRegistry,
): null | RiskPair {
  if (!assetRegistry || !riskRegistry) return null

  // Find asset indices by mint address
  const depositAsset = assetRegistry.assets.find((a) => a.mint.toString() === depositMint)
  const borrowAsset = assetRegistry.assets.find((a) => a.mint.toString() === borrowMint)

  if (!depositAsset || !borrowAsset) return null

  const depositIndex = depositAsset.index
  const borrowIndex = borrowAsset.index
  const dim = riskRegistry.dim

  // Validate indices
  if (depositIndex >= dim || borrowIndex >= dim) {
    console.warn(
      `[getRiskPairForTokens] Index out of bounds: deposit=${depositIndex}, borrow=${borrowIndex}, dim=${dim}`,
    )
    return null
  }

  // Access the risk pair from flattened 2D array
  // Matrix is stored as: pairs[row * dim + col]
  const pairIndex = depositIndex * dim + borrowIndex

  if (pairIndex >= riskRegistry.pairs.length) {
    console.warn(
      `[getRiskPairForTokens] Pair index out of bounds: ${pairIndex} >= ${riskRegistry.pairs.length}`,
    )
    return null
  }

  return riskRegistry.pairs[pairIndex]
}
