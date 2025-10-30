"use client"

import { useMemo } from "react"

import type { EnrichedPool } from "@/lib/umi/pool-utils"
import type { Asset } from "@/types/asset"

import { getPoolAvailableLiquidity } from "@/lib/umi/pool-utils"

export type AvailableAsset = {
  asset: Asset
  available: number
}

export type Mode = "borrow" | "deposit"

type WalletBalance = {
  amount_ui: number
  asset_id: number
}

/**
 * Returns the list of assets that are *available* for the given mode and a map for O(1) lookups.
 * - deposit: filters to wallet balance > epsilon
 * - borrow:  filters to pool liquidity > epsilon
 *
 * RPC version: accepts wallet balances and enriched pools as parameters
 */
export function useAvailableAssets(
  mode: Mode,
  allAssets: Asset[] | undefined,
  walletBalances?: WalletBalance[],
  enrichedPools?: EnrichedPool[],
  opts?: { epsilon?: number },
) {
  const epsilon = opts?.epsilon ?? 1e-9

  const { list, map } = useMemo(() => {
    const map = new Map<number, number>()
    const list: AvailableAsset[] = []
    if (!allAssets?.length) return { list, map }

    if (mode === "deposit") {
      for (const a of allAssets) {
        const amt = walletBalances?.find((b) => b.asset_id === a.cmc_id)?.amount_ui ?? 0
        map.set(a.cmc_id, amt)
        if (amt > epsilon) list.push({ asset: a, available: amt })
      }
    } else {
      for (const a of allAssets) {
        // Find pool by matching mint address or index
        const pool = enrichedPools?.find(
          (p) =>
            p.pool.mint.toString() === a.mint ||
            p.assetMeta?.index === a.index ||
            p.assetMeta?.index === a.cmc_id,
        )
        const liquidityUi = pool ? getPoolAvailableLiquidity(pool) : 0
        map.set(a.cmc_id, liquidityUi)
        if (liquidityUi > epsilon) list.push({ asset: a, available: liquidityUi })
      }
    }

    list.sort((a, b) => b.available - a.available || a.asset.symbol.localeCompare(b.asset.symbol))

    return { list, map }
  }, [mode, allAssets, walletBalances, enrichedPools, epsilon])

  const availableOf = (assetId: number) => map.get(assetId) ?? 0

  return { availableOf, list, map }
}
