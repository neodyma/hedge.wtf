"use client"

import type { Umi, PublicKey as UmiPublicKey } from "@metaplex-foundation/umi"

import {
  type AssetRegistry,
  getAssetRegistryGpaBuilder,
} from "@/clients/generated/accounts/assetRegistry"
import { getMarketGpaBuilder, type Market } from "@/clients/generated/accounts/market"

export async function autoLoadMarketAndRegistry(umi: Umi): Promise<{
  market: Market | null
  registry: AssetRegistry | null
}> {
  const all = await discoverMarkets(umi)
  const market = pickMarket(all)
  const registry = market ? await fetchRegistryForMarket(umi, market.publicKey) : null
  return { market, registry }
}

/** Load all Market accounts for this program. */
export async function discoverMarkets(umi: Umi): Promise<Market[]> {
  return getMarketGpaBuilder(umi).getDeserialized()
}

/** Fetch the AssetRegistry for a given Market via GPA filter. */
export async function fetchRegistryForMarket(
  umi: Umi,
  marketPk: UmiPublicKey,
): Promise<AssetRegistry | null> {
  const regs = await getAssetRegistryGpaBuilder(umi)
    .whereField("market", marketPk)
    .getDeserialized()
  return regs[0] ?? null
}

export function pickMarket(markets: Market[]): Market | null {
  if (markets.length === 0) return null
  const withScore = markets.map((m) => {
    const paused = m.paused ?? false
    const version = Number(m.version ?? 0)
    const score = (paused ? 0 : 100) + version
    return { m, score }
  })

  const prio = withScore.find((w) => w.m.publicKey.includes("7yhd"))

  if (prio) return prio.m

  withScore.sort((a, b) => b.score - a.score)
  return withScore[0].m
}
