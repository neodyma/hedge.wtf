import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { RiskRegistry } from "@/clients/generated/accounts/riskRegistry"
import type { Asset } from "@/types/asset"
import type { Position } from "@/types/portfolio"

import combinedAssetData from "@/data/combined_asset_data.json"
import { getMintByCmcId } from "@/lib/riskParameterQuery"
import { bpsToDecimal, getRiskPairForTokens } from "@/lib/umi/risk-utils"

const DEFAULT_LT = 0.9

const assetByCmcId: Map<number, { threshold_matrix?: Record<string, number> }> = (() => {
  // Filter out _market entry and extract only asset objects with cmc_id
  const entries = Object.entries(combinedAssetData as Record<string, unknown>)
    .filter(([key]) => key !== "_market") // Skip market metadata
    .map(([, value]) => value)
    .filter(
      (entry): entry is { cmc_id?: number; threshold_matrix?: Record<string, number> } =>
        typeof entry === "object" && entry !== null && "cmc_id" in entry,
    )
    .map((entry) => entry as { cmc_id?: number; threshold_matrix?: Record<string, number> })
    .filter((entry) => typeof entry.cmc_id === "number")

  const map = new Map(entries.map((entry) => [entry.cmc_id as number, entry]))

  // Debug: Log map contents
  console.log("[assetByCmcId] Map size:", map.size)
  console.log("[assetByCmcId] Sample entries:", Array.from(map.entries()).slice(0, 3))

  return map
})()

export function getPairLtByCmcIds(depositCmcId: number, borrowCmcId: number): number {
  // Look up the deposit asset's threshold_matrix
  const depositAsset = assetByCmcId.get(depositCmcId)

  console.log(`[getPairLtByCmcIds] Lookup: deposit=${depositCmcId}, borrow=${borrowCmcId}`)
  console.log(`[getPairLtByCmcIds] Found asset:`, depositAsset)

  if (!depositAsset?.threshold_matrix) {
    console.log(`[getPairLtByCmcIds] No threshold_matrix, returning default ${DEFAULT_LT}`)
    return DEFAULT_LT
  }

  // Get the threshold for this borrow asset
  const threshold = depositAsset.threshold_matrix[String(borrowCmcId)]

  console.log(`[getPairLtByCmcIds] threshold_matrix[${borrowCmcId}] =`, threshold)

  if (threshold == null) {
    console.log(`[getPairLtByCmcIds] Threshold not found, returning default ${DEFAULT_LT}`)
    return DEFAULT_LT
  }

  // Thresholds in the matrix are percentages (85, 93, etc.)
  // Convert to decimal (0.85, 0.93, etc.)
  const result = threshold / 100
  console.log(`[getPairLtByCmcIds] Returning threshold: ${threshold} → ${result}`)
  return result
}

/**
 * Get liquidation threshold from on-chain RiskRegistry
 * Falls back to JSON-based lookup if RiskRegistry data is unavailable
 *
 * @param depositCmcId - CMC ID of deposit asset
 * @param borrowCmcId - CMC ID of borrow asset
 * @param assetRegistry - AssetRegistry for mint → index mapping
 * @param riskRegistry - RiskRegistry with on-chain risk pairs
 * @returns Liquidation threshold as decimal (e.g., 0.93 for 93%)
 */
export function getPairLtFromRegistry(
  depositCmcId: number,
  borrowCmcId: number,
  assetRegistry: AssetRegistry | null,
  riskRegistry: null | RiskRegistry,
): number {
  console.log(
    `[getPairLtFromRegistry] Called with deposit=${depositCmcId}, borrow=${borrowCmcId}, hasRegistry=${Boolean(assetRegistry && riskRegistry)}`,
  )

  // Try on-chain lookup first
  if (assetRegistry && riskRegistry) {
    // Map CMC IDs to mint addresses
    const depositMint = getMintByCmcId(depositCmcId)
    const borrowMint = getMintByCmcId(borrowCmcId)

    console.log(`[getPairLtFromRegistry] Mints: deposit=${depositMint}, borrow=${borrowMint}`)

    if (depositMint && borrowMint) {
      // Get risk pair from on-chain registry
      const riskPair = getRiskPairForTokens(depositMint, borrowMint, assetRegistry, riskRegistry)

      console.log(`[getPairLtFromRegistry] On-chain riskPair:`, riskPair)

      if (riskPair) {
        // Convert basis points to decimal (9300 bps → 0.93)
        const result = bpsToDecimal(riskPair.liqThresholdBps)
        console.log(
          `[getPairLtFromRegistry] Using on-chain: ${riskPair.liqThresholdBps} bps → ${result}`,
        )
        return result
      }
    }
  }

  // Fallback to JSON-based lookup
  console.log(`[getPairLtFromRegistry] Falling back to JSON lookup`)
  return getPairLtByCmcIds(depositCmcId, borrowCmcId)
}

export function valueOfPositions(positions: Position[], type: "0d" | "1d" | "7d" | "30d"): number {
  if (!positions.length) return 0

  switch (type) {
    case "0d":
      return positions.reduce((acc, pos) => acc + pos.amount * pos.asset.price.latest, 0)
    case "1d":
      return positions.reduce((acc, pos) => acc + pos.amount * (pos.asset.price.day ?? 0), 0)
    case "7d":
      return positions.reduce((acc, pos) => acc + pos.amount * (pos.asset.price.week ?? 0), 0)
    case "30d":
      return positions.reduce((acc, pos) => acc + pos.amount * (pos.asset.price.month ?? 0), 0)
  }
}

const borrowsUsdTotal = (borrows: Position[]): number =>
  borrows.reduce((acc, b) => acc + b.amount * (b.asset.price.latest ?? 0), 0)

export type LtProvider = (assetA: number, assetB: number) => number

type PoolApySnapshot = {
  asset_id: number
  borrow_apy: number
  deposit_apy: number
}

export function getBorrowAmount(
  deposits: Position[],
  borrows: Position[],
  asset: Asset,
  goalHealthScore: number,
): number {
  if (goalHealthScore <= 0) return 0
  if (!deposits.length) return 0

  const assetPrice = asset.price?.latest ?? 0
  if (!assetPrice || assetPrice <= 0 || !Number.isFinite(assetPrice)) return 0

  let A = 0
  for (const deposit of deposits) {
    const depositUsd = deposit.amount * (deposit.asset.price?.latest ?? 0)
    if (!Number.isFinite(depositUsd)) continue

    for (const borrow of borrows) {
      const borrowUsd = borrow.amount * (borrow.asset.price?.latest ?? 0)
      if (!Number.isFinite(borrowUsd)) continue

      const lt = getPairLtByCmcIds(deposit.asset.cmc_id, borrow.asset.cmc_id)
      A += depositUsd * borrowUsd * lt
    }
  }

  let C = 0
  for (const deposit of deposits) {
    const depositUsd = deposit.amount * (deposit.asset.price?.latest ?? 0)
    if (!Number.isFinite(depositUsd)) continue

    const lt = getPairLtByCmcIds(deposit.asset.cmc_id, asset.cmc_id)
    C += depositUsd * lt
  }

  if (C <= 0) return 0

  const T = valueOfPositions(borrows, "0d")
  const H = goalHealthScore

  const aCoef = H
  const bCoef = 2 * H * T - C
  const cCoef = H * T * T - A

  const discriminant = bCoef * bCoef - 4 * aCoef * cCoef
  if (discriminant < 0) return 0

  const sqrtDiscriminant = Math.sqrt(discriminant)
  const x1 = (-bCoef + sqrtDiscriminant) / (2 * aCoef)
  const x2 = (-bCoef - sqrtDiscriminant) / (2 * aCoef)

  let x = Math.max(x1, x2)
  if (x < 0) {
    x = Math.min(x1, x2)
    if (x < 0) return 0
  }

  const tokenAmount = x / assetPrice
  return Math.max(0, tokenAmount)
}

export function getBorrowLimitWithLt(
  deposits: Position[],
  borrows: Position[],
  ltOf: LtProvider,
): number {
  if (!borrows.length) return 0

  const totalBor = borrowsUsdTotal(borrows)
  if (totalBor === 0) return 0

  const dists = borrows.map((b) => (b.amount * (b.asset.price.latest ?? 0)) / totalBor)

  let limit = 0
  for (const dep of deposits) {
    const depUsd = dep.amount * (dep.asset.price.latest ?? 0)
    if (depUsd === 0) continue

    let weightedLt = 0
    for (let i = 0; i < borrows.length; i++) {
      const b = borrows[i]
      const dist = dists[i]
      const lt = ltOf(dep.asset.cmc_id, b.asset.cmc_id)
      weightedLt += dist * lt
    }
    limit += depUsd * weightedLt
  }
  return limit
}

export function getDistribution(positions: Position[]): number[] {
  const totalValue = valueOfPositions(positions, "0d")
  if (totalValue === 0) return positions.map(() => 0)
  return positions.map((pos) => (pos.amount * pos.asset.price.latest) / totalValue)
}

export function getHealthScoreWithLt(
  deposits: Position[],
  borrows: Position[],
  ltOf: LtProvider,
): number {
  const borUsd = borrowsUsdTotal(borrows)
  if (borUsd === 0) return NaN
  const limitUsd = getBorrowLimitWithLt(deposits, borrows, ltOf)
  return limitUsd / borUsd
}

export function getProjectedApy(
  positions: Position[],
  direction: "borrow" | "deposit",
  pools: PoolApySnapshot[],
): number {
  if (!positions.length || !pools.length) return 0

  const poolMap = new Map<number, PoolApySnapshot>()
  for (const pool of pools) {
    poolMap.set(pool.asset_id, pool)
  }

  return positions.reduce((sum, pos) => {
    const price = pos.asset.price?.latest ?? 0
    if (!Number.isFinite(price) || price <= 0) return sum

    const pool = poolMap.get(pos.asset.cmc_id)
    if (!pool) return sum

    const valueUsd = pos.amount * price
    const apy = direction === "deposit" ? pool.deposit_apy : pool.borrow_apy
    if (!Number.isFinite(apy)) return sum

    return sum + valueUsd * apy
  }, 0)
}
