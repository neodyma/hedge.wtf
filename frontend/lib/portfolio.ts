import type { Asset } from "@/types/asset"
import type { Position } from "@/types/portfolio"

import combinedAssetData from "@/data/combined_asset_data.json"

const DEFAULT_LT = 0.9

const assetByCmcId: Map<number, { threshold_matrix?: Record<string, number> }> = (() => {
  const entries = Object.values(combinedAssetData as Record<string, unknown>)
    .filter(
      (entry): entry is { cmc_id?: number; threshold_matrix?: Record<string, number> } =>
        typeof entry === "object" && entry !== null && "cmc_id" in entry,
    )
    .map((entry) => entry as { cmc_id?: number; threshold_matrix?: Record<string, number> })
    .filter((entry) => typeof entry.cmc_id === "number")
  return new Map(entries.map((entry) => [entry.cmc_id as number, entry]))
})()

export function getPairLt(a0: Asset, a1: Asset): number {
  const lt = lookupThreshold(a0.cmc_id, a1.cmc_id)
  return lt ?? DEFAULT_LT
}

export function getPairLtRaw(a0: number, a1: number): number {
  const lt = lookupThreshold(a0, a1)
  return lt ?? DEFAULT_LT
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

function lookupThreshold(primaryId: number, counterId: number): null | number {
  const primary = assetByCmcId.get(primaryId)
  if (!primary?.threshold_matrix) return null
  const raw = primary.threshold_matrix[String(counterId)]
  if (raw == null) return null
  return raw > 1 ? raw / 100 : raw
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

      const lt = getPairLt(deposit.asset, borrow.asset)
      A += depositUsd * borrowUsd * lt
    }
  }

  let C = 0
  for (const deposit of deposits) {
    const depositUsd = deposit.amount * (deposit.asset.price?.latest ?? 0)
    if (!Number.isFinite(depositUsd)) continue

    const lt = getPairLt(deposit.asset, asset)
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
