"use client"

import type { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi"

import { useMemo } from "react"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { Market } from "@/clients/generated/accounts/market"
import type { Pool } from "@/clients/generated/accounts/pool"
import type { PriceCache } from "@/clients/generated/accounts/priceCache"
import type { RiskRegistry } from "@/clients/generated/accounts/riskRegistry"

import {
  useAssetRegistryByMarket,
  useAutoMarketAndRegistry,
  useMarketByPubkey,
  usePoolsByMarket,
  usePriceCacheByMarket,
} from "@/hooks/umi/queries"
import { useRiskRegistryByMarket } from "@/hooks/umi/useRiskRegistry"
import { type EnrichedPool, enrichPools } from "@/lib/umi/pool-utils"

export interface UseMarketResourcesOptions {
  enabled?: boolean
  market?: MaybePublicKey
  staleTimeMs?: number
}

export interface UseMarketResourcesResult {
  enrichedPools: EnrichedPool[]
  isLoading: boolean
  isReady: boolean
  market: Market | null
  marketAuthority: null | string
  marketPublicKey: null | string
  pools: Pool[]
  priceCache: null | PriceCache
  queries: {
    auto: ReturnType<typeof useAutoMarketAndRegistry>
    market: ReturnType<typeof useMarketByPubkey>
    pools: ReturnType<typeof usePoolsByMarket>
    priceCache: ReturnType<typeof usePriceCacheByMarket>
    registry: ReturnType<typeof useAssetRegistryByMarket>
    riskRegistry: ReturnType<typeof useRiskRegistryByMarket>
  }
  registry: AssetRegistry | null
  riskRegistry: RiskRegistry | null
}

type MaybePublicKey = null | string | UmiPublicKey | undefined

const normalizeMarketInput = (market: MaybePublicKey): string | UmiPublicKey | undefined => {
  if (!market) return undefined
  if (typeof market === "string" && !market.trim()) return undefined
  return market
}

/**
 * Consolidated hook that loads the active market, registry, pools, price cache,
 * and enriched pool metadata in a single place. It can either auto-discover a
 * market or accept an explicit public key.
 */
export function useMarketResources(options?: UseMarketResourcesOptions): UseMarketResourcesResult {
  const normalizedMarket = normalizeMarketInput(options?.market)

  // Discover market + registry when none is provided
  const auto = useAutoMarketAndRegistry({
    enabled: options?.enabled !== false && !normalizedMarket,
    staleTimeMs: options?.staleTimeMs,
  })

  const activeMarketPk = normalizedMarket ?? auto.data?.market?.publicKey ?? null

  const marketQuery = useMarketByPubkey(activeMarketPk ?? undefined, {
    enabled: Boolean(activeMarketPk),
    staleTimeMs: options?.staleTimeMs,
  })

  const registry = useAssetRegistryByMarket(activeMarketPk ?? undefined, {
    enabled: options?.enabled !== false && Boolean(activeMarketPk),
    staleTimeMs: options?.staleTimeMs,
  })

  const pools = usePoolsByMarket(activeMarketPk ?? undefined, {
    enabled: options?.enabled !== false && Boolean(activeMarketPk),
    staleTimeMs: options?.staleTimeMs,
  })

  const priceCache = usePriceCacheByMarket(activeMarketPk ?? undefined, {
    enabled: options?.enabled !== false && Boolean(activeMarketPk),
    staleTimeMs: options?.staleTimeMs,
  })

  const riskRegistry = useRiskRegistryByMarket(activeMarketPk ?? undefined, {
    enabled: options?.enabled !== false && Boolean(activeMarketPk),
    staleTimeMs: options?.staleTimeMs,
  })

  const enrichedPools = useMemo(
    () => enrichPools(pools.data ?? [], registry.data ?? null, priceCache.data ?? null),
    [pools.data, registry.data, priceCache.data],
  )

  const market = normalizedMarket
    ? marketQuery.data
    : (auto.data?.market ?? marketQuery.data ?? null)
  const isLoading =
    auto.isLoading ||
    marketQuery.isLoading ||
    registry.isLoading ||
    pools.isLoading ||
    priceCache.isLoading ||
    riskRegistry.isLoading
  const isReady =
    !isLoading &&
    Boolean(activeMarketPk && registry.data && pools.data && priceCache.data && riskRegistry.data)

  return {
    enrichedPools,
    isLoading,
    isReady,
    market: market ?? null,
    marketAuthority: market?.authority?.toString?.() ?? null,
    marketPublicKey: market?.publicKey?.toString?.() ?? null,
    pools: pools.data ?? [],
    priceCache: priceCache.data ?? null,
    queries: {
      auto,
      market: marketQuery,
      pools,
      priceCache,
      registry,
      riskRegistry,
    },
    registry: registry.data ?? null,
    riskRegistry: riskRegistry.data ?? null,
  }
}
