"use client"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { PriceCache } from "@/clients/generated/accounts/priceCache"
import type { Asset } from "@/types/asset"

import { getAssetByMint } from "@/lib/riskParameterQuery"
import { getPriceForAsset } from "@/lib/umi/pool-utils"

export function buildAssetsFromRegistry(
  registry: AssetRegistry | null | undefined,
  priceCache: null | PriceCache | undefined,
): Asset[] {
  if (!registry) return []

  return registry.assets.map((entry) => {
    const mintStr = entry.mint.toString()
    const info = getAssetByMint(mintStr)

    const price = getPriceForAsset(priceCache ?? null, entry.index) ?? 0

    return {
      cmc_id: info?.cmcId ?? entry.index,
      decimals: entry.decimals,
      index: entry.index,
      mint: mintStr,
      name: info?.name ?? mintStr.slice(0, 6),
      price: {
        latest: price,
        marketcap: 0,
      },
      symbol: info?.symbol ?? mintStr.slice(0, 6),
      zodial: info
        ? {
            assetInfo: "",
            bApy: 0,
            bToken: "",
            dToken: "",
            isMintable: true,
            ltv: info.averageRiskParameters?.avgLtv,
            mint: mintStr,
            sApy: 0,
            vaultAcc: "",
          }
        : undefined,
    } satisfies Asset
  })
}
