import { PublicKey } from "@solana/web3.js"
import { NextRequest, NextResponse } from "next/server"

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
    const limit = parseInt(searchParams.get("limit") || "100", 10)

    console.log(
      `[LeaderboardAPI] Request received - forceRefresh: ${forceRefresh}, limit: ${limit}`,
    )

    const { decimals, mints, prices } = buildAssetMaps()

    const marketPubkey = new PublicKey(MARKET_ADDRESS)

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

    let leaderboard: Awaited<ReturnType<typeof generateLeaderboard>>
    let obligationPdas: string[]
    let scannedAt: number

    if (cachedPdas && cachedPdas.length > 0) {
      // Use cached PDAs and fetch fresh obligation data
      console.log("[LeaderboardAPI] Fetching obligations from server cache...")
      obligationPdas = cachedPdas
      const obligations = await fetchObligationAccounts(RPC_URL, obligationPdas)
      leaderboard = generateLeaderboard(obligations, poolFactors, prices, decimals, limit)
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
        limit,
      )
      leaderboard = result.leaderboard
      obligationPdas = result.obligationPdas
      scannedAt = result.scannedAt

      // Cache obligation PDAs on server (shared across all users)
      serverCache.set(CACHE_KEYS.OBLIGATION_PDAS, obligationPdas, CACHE_TTL.OBLIGATION_PDAS)
    }

    // Return leaderboard data
    return NextResponse.json(
      {
        cached: !!cachedPdas,
        leaderboard,
        obligationCount: obligationPdas.length,
        scannedAt,
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

// Build asset price, decimals, and mints from combined_asset_data.json
function buildAssetMaps(): {
  decimals: Map<string, number>
  mints: string[]
  prices: Map<string, number>
} {
  const prices = new Map<string, number>()
  const decimals = new Map<string, number>()
  const mints: string[] = []

  Object.entries(assetData).forEach(([key, value]) => {
    if (key === "_market") return

    const asset = value as {
      address?: string
      decimals?: number
      price?: { latest?: number }
      zodial?: { mint?: string }
    }

    const mint = asset.zodial?.mint || asset.address
    if (!mint) return

    const price = asset.price?.latest || 0
    prices.set(mint, price)

    const decimal = asset.decimals || 6
    decimals.set(mint, decimal)

    mints.push(mint)
  })

  console.log(`[LeaderboardAPI] Loaded ${prices.size} asset prices and decimals`)
  return { decimals, mints, prices }
}
