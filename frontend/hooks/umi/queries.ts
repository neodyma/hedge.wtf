"use client"

import { publicKey as toPk, type PublicKey as UmiPublicKey } from "@metaplex-foundation/umi"
import { useQuery } from "@tanstack/react-query"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"

import { type Market, safeFetchMarket } from "@/clients/generated/accounts/market"
import {
  getObligationGpaBuilder,
  type Obligation,
  safeFetchObligation,
} from "@/clients/generated/accounts/obligation"
import { getPoolGpaBuilder, type Pool } from "@/clients/generated/accounts/pool"
import { getPriceCacheGpaBuilder, type PriceCache } from "@/clients/generated/accounts/priceCache"
import {
  autoLoadMarketAndRegistry,
  discoverMarkets,
  fetchRegistryForMarket,
} from "@/lib/umi/discovery"
import { useProgramId, useUmi } from "@/providers/UmiContext"

import { qk } from "./keys"

/* ------------------------------ helpers ---------------------------------- */

/** Base58 regex + length guard to avoid throwing in toPk. */
const BASE58_PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** Asset registry for a given market public key. Accepts undefined/empty. */
export function useAssetRegistryByMarket(
  market?: string | UmiPublicKey,
  opts?: {
    enabled?: boolean
    staleTimeMs?: number
  },
) {
  const umi = useUmi()
  const pid = useProgramId()
  const marketPk = safePublicKey(market)
  const keyStr = marketPk ? marketPk.toString() : "none"

  return useQuery<AssetRegistry | null>({
    enabled: (opts?.enabled ?? true) && Boolean(marketPk),
    queryFn: () => (marketPk ? fetchRegistryForMarket(umi, marketPk) : Promise.resolve(null)),
    queryKey: qk.registryByMarket(pid, keyStr),
    staleTime: opts?.staleTimeMs ?? 15_000,
  })
}

/* ------------------------------- queries --------------------------------- */

/** Auto-discover a market and its registry, no params. */
export function useAutoMarketAndRegistry(opts?: { enabled?: boolean; staleTimeMs?: number }) {
  const umi = useUmi()
  const pid = useProgramId()
  return useQuery<{ market: Market | null; registry: AssetRegistry | null }>({
    enabled: opts?.enabled ?? true,
    queryFn: () => autoLoadMarketAndRegistry(umi),
    queryKey: qk.autoMarketAndRegistry(pid),
    staleTime: opts?.staleTimeMs ?? 15_000,
  })
}

/** Best/default market according to our picker. */
export function useBestMarket(opts?: { enabled?: boolean; staleTimeMs?: number }) {
  const umi = useUmi()
  const pid = useProgramId()
  return useQuery<Market | null>({
    enabled: opts?.enabled ?? true,
    queryFn: async () => (await autoLoadMarketAndRegistry(umi)).market,
    queryKey: qk.bestMarket(pid),
    staleTime: opts?.staleTimeMs ?? 15_000,
  })
}

/** Fetch a specific Market account by public key. */
export function useMarketByPubkey(
  market?: string | UmiPublicKey,
  opts?: {
    enabled?: boolean
    staleTimeMs?: number
  },
) {
  const umi = useUmi()
  const pid = useProgramId()
  const marketPk = safePublicKey(market)
  const keyStr = marketPk ? marketPk.toString() : "none"

  return useQuery<Market | null>({
    enabled: (opts?.enabled ?? true) && Boolean(marketPk),
    queryFn: () => (marketPk ? safeFetchMarket(umi, marketPk) : Promise.resolve(null)),
    queryKey: qk.marketByPubkey(pid, keyStr),
    staleTime: opts?.staleTimeMs ?? 15_000,
  })
}

/** All markets for this program. */
export function useMarkets(opts?: { enabled?: boolean; staleTimeMs?: number }) {
  const umi = useUmi()
  const pid = useProgramId()
  return useQuery({
    enabled: opts?.enabled ?? true,
    queryFn: () => discoverMarkets(umi),
    queryKey: qk.markets(pid),
    staleTime: opts?.staleTimeMs ?? 15_000,
  })
}

/** Fetch a single obligation by its PDA (for viewing other users' portfolios). */
export function useObligationByPda(
  obligationPda?: string | UmiPublicKey,
  opts?: {
    enabled?: boolean
    staleTimeMs?: number
  },
) {
  const umi = useUmi()
  const pid = useProgramId()
  const pk = safePublicKey(obligationPda)
  const keyStr = pk ? pk.toString() : "none"

  return useQuery<null | Obligation>({
    enabled: (opts?.enabled ?? true) && Boolean(pk),
    queryFn: () => (pk ? safeFetchObligation(umi, pk) : Promise.resolve(null)),
    queryKey: qk.obligationByPda(pid, keyStr),
    staleTime: opts?.staleTimeMs ?? 5_000,
  })
}

/** Obligations by owner (optionally filtered by market). Both inputs are optional. */
export function useObligationsByOwner(
  owner?: string | UmiPublicKey,
  opts?: { enabled?: boolean; market?: string | UmiPublicKey; staleTimeMs?: number },
) {
  const umi = useUmi()
  const pid = useProgramId()

  const ownerPk = safePublicKey(owner)
  const marketPk = safePublicKey(opts?.market)

  const ownerKeyStr = ownerPk ? ownerPk.toString() : "none"
  const marketKeyStr = marketPk ? marketPk.toString() : "none"

  return useQuery<Obligation[]>({
    enabled: (opts?.enabled ?? true) && Boolean(ownerPk),
    queryFn: async () => {
      if (!ownerPk) return []
      let b = getObligationGpaBuilder(umi).whereField("owner", ownerPk)
      if (marketPk) b = b.whereField("market", marketPk)
      return b.getDeserialized()
    },
    queryKey: qk.obligationsByOwner(pid, ownerKeyStr, marketPk ? marketKeyStr : undefined),
    staleTime: opts?.staleTimeMs ?? 5_000,
  })
}

/** Pools filtered by market (optional). Disabled when market is missing/invalid. */
export function usePoolsByMarket(
  market?: string | UmiPublicKey,
  opts?: {
    enabled?: boolean
    staleTimeMs?: number
  },
) {
  const umi = useUmi()
  const pid = useProgramId()
  const marketPk = safePublicKey(market)
  const keyStr = marketPk ? marketPk.toString() : "none"

  return useQuery<Pool[]>({
    enabled: (opts?.enabled ?? true) && Boolean(marketPk),
    queryFn: () =>
      marketPk
        ? getPoolGpaBuilder(umi).whereField("market", marketPk).getDeserialized()
        : Promise.resolve([]),
    queryKey: qk.poolsByMarket(pid, keyStr),
    staleTime: opts?.staleTimeMs ?? 10_000,
  })
}

/** PriceCache filtered by market (optional). Disabled when market is missing/invalid. */
export function usePriceCacheByMarket(
  market?: string | UmiPublicKey,
  opts?: {
    enabled?: boolean
    staleTimeMs?: number
  },
) {
  const umi = useUmi()
  const pid = useProgramId()
  const marketPk = safePublicKey(market)
  const keyStr = marketPk ? marketPk.toString() : "none"

  return useQuery<null | PriceCache>({
    enabled: (opts?.enabled ?? true) && Boolean(marketPk),
    queryFn: async () => {
      if (!marketPk) return null
      const list = await getPriceCacheGpaBuilder(umi)
        .whereField("market", marketPk)
        .getDeserialized()
      return list[0] ?? null
    },
    queryKey: qk.priceCacheByMarket(pid, keyStr),
    staleTime: opts?.staleTimeMs ?? 5_000,
  })
}

/** Safely parse a string or pass-through a UmiPublicKey. Returns null if invalid/empty. */
function safePublicKey(input?: null | string | UmiPublicKey): null | UmiPublicKey {
  if (!input) return null
  if (typeof input !== "string") return input
  const s = input.trim()
  if (!BASE58_PUBKEY_RE.test(s)) return null
  try {
    return toPk(s)
  } catch {
    return null
  }
}
