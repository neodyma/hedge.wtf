"use client"

import { useMemo } from "react"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { Obligation } from "@/clients/generated/accounts/obligation"
import type { Pool } from "@/clients/generated/accounts/pool"
import type { PriceCache } from "@/clients/generated/accounts/priceCache"
import type { RiskRegistry } from "@/clients/generated/accounts/riskRegistry"
import type { Asset } from "@/types/asset"
import type { ObligationAmounts, ObligationTokenPosition, Position } from "@/types/portfolio"

import { usePortfolioRefetch } from "@/hooks/umi/portfolioInvalidation"
import { useMarketResources } from "@/hooks/umi/useMarketResources"
import {
  useWalletBalances,
  type WalletBalance as WalletBalanceResult,
} from "@/hooks/umi/useWalletBalances"
import { useWalletObligations } from "@/hooks/umi/useWalletObligations"
import { useSolanaWallet } from "@/hooks/useSolanaWallet"
import { getAssetByMint } from "@/lib/riskParameterQuery"
import { calculateUserBorrowAmount, calculateUserDepositAmount } from "@/lib/umi/obligation-utils"
import { getPriceForAsset } from "@/lib/umi/pool-utils"

export interface PortfolioWalletBalance {
  amount_ui: number
  asset_id: number
  mint: string
}

export interface UsePortfolioSnapshotResult {
  assets: Asset[]
  assetsLoading: boolean
  enrichedPools: ReturnType<typeof useMarketResources>["enrichedPools"]
  isWalletConnected: boolean
  marketAuthority: null | string
  marketPublicKey: null | string
  obligations: ObligationAmounts
  obligationsQuery: ReturnType<typeof useWalletObligations>
  ownerAddress: null | string
  portfolioRefresh: () => Promise<unknown>
  priceCache: null | PriceCache
  registry: AssetRegistry | null
  riskRegistry: null | RiskRegistry
  walletBalances: PortfolioWalletBalance[]
  walletBalancesQuery: ReturnType<typeof useWalletBalances>
  wrappedPositions: {
    borrows: Position[]
    deposits: Position[]
  }
}

/**
 * Bundles the primary portfolio queries (market resources, wallet balances,
 * and obligations) into a single hook and provides normalized data structures
 */
export function usePortfolioSnapshot(): UsePortfolioSnapshotResult {
  const { address, isConnected } = useSolanaWallet()
  const ownerAddress = isConnected && address ? address : null

  const marketResources = useMarketResources()
  const selectedMarket = marketResources.marketPublicKey

  const walletBalancesQuery = useWalletBalances(marketResources.registry, {
    enabled: Boolean(ownerAddress) && Boolean(marketResources.registry),
  })

  const obligationsQuery = useWalletObligations({
    enabled: Boolean(ownerAddress) && Boolean(selectedMarket),
    market: selectedMarket ?? undefined,
  })

  const walletBalances = useMemo<PortfolioWalletBalance[]>(() => {
    const entries = walletBalancesQuery.data ?? []
    return entries.map((item: WalletBalanceResult) => ({
      amount_ui: item.amountUi,
      asset_id: item.assetIndex,
      mint: item.mint,
    }))
  }, [walletBalancesQuery.data])

  const assets = useMemo<Asset[]>(() => {
    const registry = marketResources.registry
    if (!registry) return []

    return registry.assets.map((a): Asset => {
      const mintStr = a.mint.toString()
      const assetInfo = getAssetByMint(mintStr)

      const name = assetInfo?.name ?? `${mintStr.slice(0, 8)}...`
      const symbol = assetInfo?.symbol ?? mintStr.slice(0, 8)
      const price: Asset["price"] = {
        latest: getPriceForAsset(marketResources.priceCache ?? null, a.index) ?? 0,
        marketcap: 0,
      }

      return {
        cmc_id: a.index,
        decimals: a.decimals,
        index: a.index,
        mint: mintStr,
        name,
        price,
        symbol,
      }
    })
  }, [marketResources.registry, marketResources.priceCache])

  const firstObligation: Obligation | undefined = obligationsQuery.data?.[0]

  const obligations = useMemo<ObligationAmounts>(() => {
    return deriveObligationAmounts(firstObligation, marketResources.registry, marketResources.pools)
  }, [firstObligation, marketResources.registry, marketResources.pools])

  const wrappedPositions = useMemo(
    () => wrapObligationsWithAssets(obligations, assets),
    [obligations, assets],
  )

  const portfolioRefresh = usePortfolioRefetch(ownerAddress, selectedMarket ?? undefined)

  return {
    assets,
    assetsLoading: marketResources.queries.registry.isLoading,
    enrichedPools: marketResources.enrichedPools,
    isWalletConnected: isConnected,
    marketAuthority: marketResources.marketAuthority,
    marketPublicKey: selectedMarket,
    obligations,
    obligationsQuery,
    ownerAddress,
    portfolioRefresh,
    priceCache: marketResources.priceCache,
    registry: marketResources.registry,
    riskRegistry: marketResources.riskRegistry,
    walletBalances,
    walletBalancesQuery,
    wrappedPositions,
  }
}

function deriveObligationAmounts(
  obligation: Obligation | undefined,
  registry: AssetRegistry | null,
  pools: Pool[],
): ObligationAmounts {
  if (!obligation || !registry) {
    return { borrows: [], deposits: [] }
  }

  const deposits: ObligationTokenPosition[] = []
  const borrows: ObligationTokenPosition[] = []

  for (const pos of obligation.positions) {
    const mintStr = pos.mint.toString()
    const assetMeta = registry.assets.find((asset) => asset.mint.toString() === mintStr)
    const pool = pools.find((p) => p.mint.toString() === mintStr)

    if (!assetMeta || !pool) continue

    const depositShares = BigInt(pos.depositSharesQ60)
    if (depositShares > 0n) {
      deposits.push({
        amount_ui: calculateUserDepositAmount(depositShares, pool, assetMeta.decimals),
        asset_id: assetMeta.index,
        initial_amount_ui: 0,
        mint: mintStr,
      })
    }

    const borrowShares = BigInt(pos.borrowSharesQ60)
    if (borrowShares > 0n) {
      borrows.push({
        amount_ui: calculateUserBorrowAmount(borrowShares, pool, assetMeta.decimals),
        asset_id: assetMeta.index,
        initial_amount_ui: 0,
        mint: mintStr,
      })
    }
  }

  return { borrows, deposits }
}

function wrapObligationsWithAssets(obligations: ObligationAmounts, assets: Asset[]) {
  const wrap = (entries: ObligationTokenPosition[]): Position[] =>
    entries
      .map((entry) => {
        const asset = assets.find((a) => a.cmc_id === entry.asset_id)
        if (!asset) return null
        return { amount: entry.amount_ui, asset }
      })
      .filter(Boolean) as Position[]

  return {
    borrows: wrap(obligations.borrows),
    deposits: wrap(obligations.deposits),
  }
}
