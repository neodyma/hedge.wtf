import { publicKey as toPk } from "@metaplex-foundation/umi"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { PublicKey } from "@solana/web3.js"

import { safeFetchAllPool } from "@/clients/generated/accounts/pool"

export interface PoolCacheData {
  expiresAt: number
  pools: Map<string, PoolFactors>
  scannedAt: number
}

export interface PoolFactors {
  borrowFacQ60: bigint
  depositFacQ60: bigint
}

const SEED_POOL = Buffer.from("pool")

/**
 * Fetch all pool accounts from RPC for a given market
 * Returns Map<mint, { depositFacQ60, borrowFacQ60 }>
 */
export async function fetchAllPoolsFromRPC(
  rpcUrl: string,
  marketPubkey: PublicKey,
  programId: PublicKey,
  assetMints: string[],
): Promise<Map<string, PoolFactors>> {
  console.log(`[PoolFetcher] Fetching ${assetMints.length} pool accounts from RPC...`)

  const umi = createUmi(rpcUrl)

  const poolPdas = assetMints.map((mintStr) => {
    const mint = new PublicKey(mintStr)
    const [poolPda] = findPoolPda(programId, marketPubkey, mint)
    return toPk(poolPda.toString())
  })

  const fetchedPools = await safeFetchAllPool(umi, poolPdas)

  const pools = new Map<string, PoolFactors>()

  fetchedPools.forEach((pool) => {
    const mintStr = pool.mint.toString()

    pools.set(mintStr, {
      borrowFacQ60: pool.borrowFacQ60,
      depositFacQ60: pool.depositFacQ60,
    })

    const depositFacFloat = Number(pool.depositFacQ60) / Number(1n << 60n)
    const borrowFacFloat = Number(pool.borrowFacQ60) / Number(1n << 60n)
    console.log(
      `[PoolFetcher]   ${mintStr.slice(0, 8)}... - DepositFac: ${depositFacFloat.toFixed(6)}, BorrowFac: ${borrowFacFloat.toFixed(6)}`,
    )
  })

  const fetchedMints = new Set(fetchedPools.map((p) => p.mint.toString()))
  assetMints.forEach((mintStr) => {
    if (!fetchedMints.has(mintStr)) {
      console.warn(`[PoolFetcher]   Pool not found for mint ${mintStr.slice(0, 8)}...`)
    }
  })

  console.log(`[PoolFetcher] Fetched ${pools.size} pool accounts`)
  return pools
}

/**
 * Convert deposit/borrow shares to token amounts
 * Formula: amount = (shares * factor) / 2^60
 */
export function sharesToAmount(sharesQ60: bigint, factorQ60: bigint, decimals: number): number {
  const Q60_SHIFT = 60n
  const atomicAmount = (sharesQ60 * factorQ60) >> Q60_SHIFT
  return Number(atomicAmount) / Math.pow(10, decimals)
}

function findPoolPda(
  programId: PublicKey,
  market: PublicKey,
  mint: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_POOL, market.toBuffer(), mint.toBuffer()],
    programId,
  )
}
