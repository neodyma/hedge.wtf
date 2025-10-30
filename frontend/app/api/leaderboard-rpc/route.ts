import { publicKey as toPk } from "@metaplex-foundation/umi"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { PublicKey } from "@solana/web3.js"
import { NextRequest, NextResponse } from "next/server"

import { getAssetRegistryGpaBuilder } from "@/clients/generated/accounts/assetRegistry"
import { getPriceCacheGpaBuilder } from "@/clients/generated/accounts/priceCache"
import { ZODIAL_V2_PROGRAM_ID } from "@/clients/generated/programs/zodialV2"
import assetData from "@/data/combined_asset_data.json"
import {
  fetchObligationAccounts,
  generateLeaderboard,
  scanAndGenerateLeaderboard,
} from "@/lib/rpc/obligation-scanner"
import { fetchAllPoolsFromRPC, type PoolFactors } from "@/lib/rpc/pool-fetcher"
import { CACHE_KEYS, CACHE_TTL, serverCache } from "@/lib/rpc/server-cache"

const RPC_URL = process.env.NEXT_PUBLIC_RPC ?? "https://api.devnet.solana.com"
const MARKET_ADDRESS = assetData._market.market
const PROGRAM_ID = new PublicKey(ZODIAL_V2_PROGRAM_ID)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.get("force_refresh") === "true"
    const page = parseInt(searchParams.get("page") || "1", 10)
    const pageSize = parseInt(searchParams.get("pageSize") || "100", 10)

    // Calculate offset for pagination
    const offset = (page - 1) * pageSize

    console.log(
      `[LeaderboardAPI] Request received - forceRefresh: ${forceRefresh}, page: ${page}, pageSize: ${pageSize}, offset: ${offset}`,
    )

    const marketPubkey = new PublicKey(MARKET_ADDRESS)
    const { decimals, mints, prices } = await buildAssetMapsFromOnChain(marketPubkey)

    let poolFactors: Map<string, PoolFactors>

    if (!forceRefresh) {
      const cachedPools = serverCache.get<Map<string, PoolFactors>>(CACHE_KEYS.POOL_FACTORS)
      if (cachedPools) {
        poolFactors = cachedPools.data
        console.log(`[LeaderboardAPI] Using cached pool factors: ${poolFactors.size} pools`)
      } else {
        console.log("[LeaderboardAPI] Pool factors not cached, fetching from RPC...")
        poolFactors = await fetchAllPoolsFromRPC(RPC_URL, marketPubkey, PROGRAM_ID, mints)
        serverCache.set(CACHE_KEYS.POOL_FACTORS, poolFactors, CACHE_TTL.POOL_FACTORS)
        console.log(`[LeaderboardAPI] Cached ${poolFactors.size} pool factors for 24h`)
      }
    } else {
      console.log("[LeaderboardAPI] Force refresh - fetching pool factors from RPC...")
      poolFactors = await fetchAllPoolsFromRPC(RPC_URL, marketPubkey, PROGRAM_ID, mints)
      serverCache.set(CACHE_KEYS.POOL_FACTORS, poolFactors, CACHE_TTL.POOL_FACTORS)
      console.log(`[LeaderboardAPI] Cached ${poolFactors.size} pool factors for 24h`)
    }

    let cachedPdas: null | string[] = null

    if (!forceRefresh) {
      const cached = serverCache.get<string[]>(CACHE_KEYS.OBLIGATION_PDAS)
      if (cached) {
        cachedPdas = cached.data
        console.log(`[LeaderboardAPI] Using server-cached PDAs: ${cachedPdas.length}`)
      }
    }

    let leaderboard: Awaited<ReturnType<typeof generateLeaderboard>>["entries"]
    let obligationPdas: string[]
    let scannedAt: number
    let totalEntries: number

    if (cachedPdas && cachedPdas.length > 0) {
      // Use cached PDAs and fetch fresh obligation data
      console.log("[LeaderboardAPI] Fetching obligations from server cache...")
      obligationPdas = cachedPdas
      const obligations = await fetchObligationAccounts(RPC_URL, obligationPdas)
      const result = generateLeaderboard(
        obligations,
        poolFactors,
        prices,
        decimals,
        offset,
        pageSize,
      )
      leaderboard = result.entries
      totalEntries = result.totalEntries
      scannedAt = serverCache.get<string[]>(CACHE_KEYS.OBLIGATION_PDAS)?.scannedAt || Date.now()
    } else {
      // Perform full scan with market filter
      console.log("[LeaderboardAPI] Performing full obligation scan...")
      const result = await scanAndGenerateLeaderboard(
        RPC_URL,
        marketPubkey,
        poolFactors,
        prices,
        decimals,
        offset,
        pageSize,
      )
      leaderboard = result.leaderboard
      obligationPdas = result.obligationPdas
      scannedAt = result.scannedAt
      totalEntries = result.totalEntries

      // Cache obligation PDAs on server (shared across all users)
      serverCache.set(CACHE_KEYS.OBLIGATION_PDAS, obligationPdas, CACHE_TTL.OBLIGATION_PDAS)
    }

    // Calculate total pages
    const totalPages = Math.ceil(totalEntries / pageSize)

    // Return leaderboard data with pagination metadata
    return NextResponse.json(
      {
        cached: !!cachedPdas,
        leaderboard,
        obligationCount: obligationPdas.length,
        page,
        pageSize,
        scannedAt,
        totalEntries,
        totalPages,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
        status: 200,
      },
    )
  } catch (error) {
    console.error("[LeaderboardAPI] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch leaderboard",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// Build asset price, decimals, and mints from on-chain AssetRegistry and PriceCache
async function buildAssetMapsFromOnChain(marketPubkey: PublicKey): Promise<{
  decimals: Map<string, number>
  mints: string[]
  prices: Map<string, number>
}> {
  const umi = createUmi(RPC_URL)

  // Fetch registry and price cache filtered by market
  const marketUmiPk = toPk(marketPubkey.toBase58())
  const [registryList, priceCacheList] = await Promise.all([
    getAssetRegistryGpaBuilder(umi).whereField("market", marketUmiPk).getDeserialized(),
    getPriceCacheGpaBuilder(umi).whereField("market", marketUmiPk).getDeserialized(),
  ])

  const registry = registryList[0] ?? null
  const priceCache = priceCacheList[0] ?? null

  if (!registry) {
    throw new Error("AssetRegistry not found for market")
  }

  console.log(
    `[LeaderboardAPI] Fetched registry with ${registry.assets.length} assets${
      priceCache ? ", price cache entries: " + priceCache.prices.length : ", no price cache"
    }`,
  )

  const decimals = new Map<string, number>()
  const prices = new Map<string, number>()
  const mints: string[] = []

  // Index price entries by assetIndex for quick lookup
  const priceByIndex = new Map<number, number>()
  if (priceCache) {
    for (const entry of priceCache.prices) {
      const px = Number(entry.priceQ60) / Number(1n << 60n)
      priceByIndex.set(entry.assetIndex, px)
    }
  }

  registry.assets.forEach((asset, idx) => {
    const mintStr = asset.mint.toString()
    mints.push(mintStr)

    // Decimals from registry (authoritative)
    decimals.set(mintStr, asset.decimals)

    // Price from cache when available, otherwise default to 0 (unknown)
    const px = priceByIndex.get(idx) ?? 0
    prices.set(mintStr, px)
  })

  console.log(
    `[LeaderboardAPI] Loaded ${prices.size} asset prices and ${decimals.size} decimals from on-chain data`,
  )

  return { decimals, mints, prices }
}
