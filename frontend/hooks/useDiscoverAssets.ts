"use client"

import { useEffect, useMemo, useState } from "react"

import type { EnrichedPool } from "@/lib/umi/pool-utils"

import { useMarketResources } from "@/hooks/umi/useMarketResources"
import { getPrice } from "@/lib/cmc"
import { getAssetByMint } from "@/lib/riskParameterQuery"
import { calculateCurrentApys } from "@/lib/umi/rate-calculations"

export interface DiscoverAsset extends EnrichedPool {
  assetData: null | ReturnType<typeof getAssetByMint>
  assetName: string
  assetSymbol: string
  borrowApy: number
  cmcId: number
  depositApy: number
  priceChange24h: number
}

/**
 * Fetch and enrich assets for the Discover flow.
 * - pulls pools/registry via useMarketResources
 * - matches assets to combined_asset_data.json entries
 * - fetches 24h price deltas for ordering
 */
export function useDiscoverAssets() {
  const { enrichedPools, isLoading: baseLoading, market, registry } = useMarketResources()

  const baseAssets = useMemo(() => {
    if (!registry) return []

    return enrichedPools
      .map((pool) => {
        const mint = pool.pool.mint.toString()
        const asset = getAssetByMint(mint)
        if (!asset?.cmcId) return null

        const utilizationBps = Math.round(pool.utilizationRate * 100)
        const apys = calculateCurrentApys(pool.pool.rate, utilizationBps)

        return {
          ...pool,
          assetData: asset,
          assetName: asset.name,
          assetSymbol: asset.symbol,
          borrowApy: apys.borrowApyPercent,
          cmcId: asset.cmcId,
          depositApy: apys.depositApyPercent,
          priceChange24h: 0,
        } satisfies DiscoverAsset
      })
      .filter(Boolean) as DiscoverAsset[]
  }, [enrichedPools, registry])

  const [assets, setAssets] = useState<DiscoverAsset[]>([])
  const [loadingPrices, setLoadingPrices] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function enrichPrices() {
      if (baseAssets.length === 0) {
        setAssets([])
        return
      }

      try {
        setLoadingPrices(true)
        const cmcIds = baseAssets.map((asset) => asset.cmcId)
        const priceMap = await getPrice(cmcIds)

        const withDeltas = baseAssets.map((asset) => {
          const price = priceMap[asset.cmcId]
          const delta =
            price && price.day && price.day !== 0
              ? ((price.latest - price.day) / price.day) * 100
              : 0
          return { ...asset, priceChange24h: delta }
        })

        const gainers = withDeltas
          .filter((a) => a.priceChange24h > 0)
          .sort((a, b) => b.priceChange24h - a.priceChange24h)
        const losers = withDeltas
          .filter((a) => a.priceChange24h <= 0)
          .sort((a, b) => a.priceChange24h - b.priceChange24h)

        const interleaved: DiscoverAsset[] = []
        const max = Math.max(gainers.length, losers.length)
        for (let i = 0; i < max; i++) {
          if (i < gainers.length) interleaved.push(gainers[i])
          if (i < losers.length) interleaved.push(losers[i])
        }

        if (!cancelled) setAssets(interleaved)
      } catch (error) {
        console.warn("[useDiscoverAssets] failed to load price changes", error)
        if (!cancelled) setAssets(baseAssets)
      } finally {
        if (!cancelled) setLoadingPrices(false)
      }
    }

    enrichPrices()
    return () => {
      cancelled = true
    }
  }, [baseAssets])

  return {
    assets,
    isLoading: baseLoading || loadingPrices,
    market,
    registry,
  }
}
