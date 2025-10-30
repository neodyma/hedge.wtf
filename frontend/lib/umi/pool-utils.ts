import type { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { Pool } from "@/clients/generated/accounts/pool"
import type { PriceCache } from "@/clients/generated/accounts/priceCache"
import type { AssetMeta } from "@/clients/generated/types/assetMeta"

/**
 * Enriched pool data for display
 */
export interface EnrichedPool {
  assetMeta: AssetMeta | null
  pool: Pool
  price: null | number
  totalBorrows: number
  totalDeposits: number
  utilizationRate: number
}

/**
 * Calculate total borrows in UI units for a pool
 * (totalBorrowShares × borrowFactor / 2^60) / 2^60 / 10^decimals
 * @param pool - Pool account data
 * @param decimals - Token decimals from AssetMeta
 * @returns Total borrows in UI units (human-readable amount)
 */
export function calculateTotalBorrows(pool: Pool, decimals: number): number {
  const shares = pool.totalBorrowSharesQ60
  const factor = pool.borrowFacQ60
  // shares × factor gives us Q120, divide by Q60 to get Q60, then convert to number
  const totalQ60 = (shares * factor) / 2n ** 60n
  const atomic = q60ToNumber(totalQ60)
  // Convert from atomic units to UI units
  return atomic / Math.pow(10, decimals)
}

/**
 * Calculate total deposits in UI units for a pool
 * (totalDepositShares × depositFactor / 2^60) / 2^60 / 10^decimals
 * @param pool - Pool account data
 * @param decimals - Token decimals from AssetMeta
 * @returns Total deposits in UI units (human-readable amount)
 */
export function calculateTotalDeposits(pool: Pool, decimals: number): number {
  const shares = pool.totalDepositSharesQ60
  const factor = pool.depositFacQ60
  // shares × factor gives us Q120, divide by Q60 to get Q60, then convert to number
  const totalQ60 = (shares * factor) / 2n ** 60n
  const atomic = q60ToNumber(totalQ60)
  // Convert from atomic units to UI units
  return atomic / Math.pow(10, decimals)
}

/**
 * Calculate utilization rate for a pool
 * (borrows / deposits) × 100
 * @param pool - Pool account data
 * @param decimals - Token decimals from AssetMeta
 * @returns Percentage as number (0-100+)
 */
export function calculateUtilizationRate(pool: Pool, decimals: number): number {
  const deposits = calculateTotalDeposits(pool, decimals)
  const borrows = calculateTotalBorrows(pool, decimals)

  if (deposits === 0) return 0
  return (borrows / deposits) * 100
}

export function enrichPool(
  pool: Pool,
  registry: AssetRegistry | null,
  priceCache: null | PriceCache,
): EnrichedPool {
  const assetMeta = getAssetMetaByMint(registry, pool.mint)
  const decimals = assetMeta?.decimals ?? 0 // Default to 0 if no asset metadata
  const price = assetMeta ? getPriceForAsset(priceCache, assetMeta.index) : null
  const totalDeposits = calculateTotalDeposits(pool, decimals)
  const totalBorrows = calculateTotalBorrows(pool, decimals)
  const utilizationRate = calculateUtilizationRate(pool, decimals)

  return {
    assetMeta,
    pool,
    price,
    totalBorrows,
    totalDeposits,
    utilizationRate,
  }
}

export function enrichPools(
  pools: Pool[],
  registry: AssetRegistry | null,
  priceCache: null | PriceCache,
): EnrichedPool[] {
  return pools.map((pool) => enrichPool(pool, registry, priceCache))
}

export function formatMintAddress(mint: UmiPublicKey, length: number = 8): string {
  const str = mint.toString()
  if (str.length <= length * 2) return str
  return `${str.slice(0, length)}...${str.slice(-length)}`
}

/**
 * Format Q60 bigint as readable number string rounded to 2 decimals
 * @param q60Value - Q60 fixed-point bigint
 * @returns Formatted string (e.g., "1.23")
 */
export function formatQ60ToReadable(q60Value: bigint): string {
  const num = q60ToNumber(q60Value)
  return num.toFixed(2)
}

/**
 * Find asset metadata by asset index in the asset registry
 */
export function getAssetMetaByIndex(
  registry: AssetRegistry | null,
  index: number,
): AssetMeta | null {
  if (!registry) return null
  return registry.assets.find((asset) => asset.index === index) ?? null
}

/**
 * Find asset metadata by mint address in the asset registry
 */
export function getAssetMetaByMint(
  registry: AssetRegistry | null,
  mint: UmiPublicKey,
): AssetMeta | null {
  if (!registry) return null

  const mintStr = mint.toString()
  return registry.assets.find((asset) => asset.mint.toString() === mintStr) ?? null
}

export function getPoolAvailableLiquidity(enrichedPool: EnrichedPool): number {
  return Math.max(0, enrichedPool.totalDeposits - enrichedPool.totalBorrows)
}

/**
 * Get price for an asset from PriceCache by asset index
 * Returns price as a number (Q60 converted)
 */
export function getPriceForAsset(priceCache: null | PriceCache, assetIndex: number): null | number {
  if (!priceCache) return null

  const priceEntry = priceCache.prices.find((p) => p.assetIndex === assetIndex)
  if (!priceEntry) return null

  return q60ToNumber(priceEntry.priceQ60)
}

/**
 * Get readable shares and factor values from pool
 * @param pool - Pool account data
 * @returns Object with formatted shares and factors
 */
export function getReadablePoolValues(pool: Pool): {
  borrowFactor: string
  borrowShares: string
  depositFactor: string
  depositShares: string
} {
  return {
    borrowFactor: formatQ60ToReadable(pool.borrowFacQ60),
    borrowShares: formatQ60ToReadable(pool.totalBorrowSharesQ60),
    depositFactor: formatQ60ToReadable(pool.depositFacQ60),
    depositShares: formatQ60ToReadable(pool.totalDepositSharesQ60),
  }
}

/**
 * Convert Q60 fixed-point number to JavaScript number
 * Q60 format: value = rawValue / 2^60
 */
export function q60ToNumber(q60Value: bigint): number {
  const Q60_DIVISOR = 2n ** 60n
  return Number(q60Value) / Number(Q60_DIVISOR)
}
