/**
 * RPC-based obligation scanner for fetching all obligation accounts from on chain state
 */

import type { RpcAccount } from "@metaplex-foundation/umi"

import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes"
import { publicKey as toPk } from "@metaplex-foundation/umi"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { Connection, GetProgramAccountsFilter, PublicKey } from "@solana/web3.js"

import { deserializeObligation, type Obligation } from "@/clients/generated/accounts/obligation"
import { ZODIAL_V2_PROGRAM_ID } from "@/clients/generated/programs/zodialV2"
import { type PoolFactors, sharesToAmount } from "@/lib/rpc/pool-fetcher"

// Obligation account discriminator
const OBLIGATION_DISCRIMINATOR = new Uint8Array([168, 206, 141, 106, 88, 76, 172, 167])

export interface LeaderboardEntry {
  account: string
  owner: string
  portfolio_value: string
  totalBorrowsUsd: number
  totalDepositsUsd: number
}

export interface ObligationScanResult {
  leaderboard: LeaderboardEntry[]
  obligationPdas: string[]
  scannedAt: number
}

/**
 * Calculate portfolio value for a single obligation
 * Portfolio Value = Total Deposits (USD) - Total Borrows (USD)
 */
export function calculateObligationValue(
  obligation: Obligation,
  poolFactors: Map<string, PoolFactors>,
  assetPrices: Map<string, number>,
  assetDecimals: Map<string, number>,
): {
  portfolioValue: number
  totalBorrowsUsd: number
  totalDepositsUsd: number
} {
  let totalDepositsUsd = 0
  let totalBorrowsUsd = 0

  for (const position of obligation.positions) {
    const mintStr = position.mint.toString()
    const price = assetPrices.get(mintStr) || 0
    const decimals = assetDecimals.get(mintStr) || 6

    if (position.depositSharesQ60 === 0n && position.borrowSharesQ60 === 0n) {
      continue
    }

    // Get pool factors from cache
    const pool = poolFactors.get(mintStr)
    if (!pool) {
      console.warn(`[ObligationScanner] No pool factors for ${mintStr}`)
      continue
    }

    if (position.depositSharesQ60 > 0n) {
      const depositAmount = sharesToAmount(position.depositSharesQ60, pool.depositFacQ60, decimals)
      totalDepositsUsd += depositAmount * price
    }

    if (position.borrowSharesQ60 > 0n) {
      const borrowAmount = sharesToAmount(position.borrowSharesQ60, pool.borrowFacQ60, decimals)
      totalBorrowsUsd += borrowAmount * price
    }
  }

  return {
    portfolioValue: totalDepositsUsd - totalBorrowsUsd,
    totalBorrowsUsd,
    totalDepositsUsd,
  }
}

/**
 * Fetch obligation account data for specific PDAs (batched)
 */
export async function fetchObligationAccounts(
  rpcUrl: string,
  pdas: string[],
): Promise<Obligation[]> {
  const umi = createUmi(rpcUrl)
  const obligations: Obligation[] = []

  const batchSize = 100
  for (let i = 0; i < pdas.length; i += batchSize) {
    const batch = pdas.slice(i, i + batchSize)
    const pubkeys = batch.map((pda) => toPk(pda))

    const accountInfos = await umi.rpc.getAccounts(pubkeys)

    for (const accountInfo of accountInfos) {
      if (accountInfo.exists) {
        try {
          const obligation = deserializeObligation(accountInfo as RpcAccount)
          obligations.push(obligation)
        } catch (error) {
          console.error(`[ObligationScanner] Failed to deserialize obligation:`, error)
        }
      }
    }
  }

  console.log(`[ObligationScanner] Fetched ${obligations.length} obligation accounts`)
  return obligations
}

/**
 * Generate leaderboard from obligation accounts
 * Sorts by portfolio value (deposits - borrows) in descending order
 */
export function generateLeaderboard(
  obligations: Obligation[],
  poolFactors: Map<string, PoolFactors>,
  assetPrices: Map<string, number>,
  assetDecimals: Map<string, number>,
  limit = 100,
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = []

  for (const obligation of obligations) {
    const { portfolioValue, totalBorrowsUsd, totalDepositsUsd } = calculateObligationValue(
      obligation,
      poolFactors,
      assetPrices,
      assetDecimals,
    )

    entries.push({
      account: obligation.publicKey,
      owner: obligation.owner.toString(),
      portfolio_value: portfolioValue.toString(),
      totalBorrowsUsd,
      totalDepositsUsd,
    })
  }

  entries.sort((a, b) => Number(b.portfolio_value) - Number(a.portfolio_value))

  return entries.slice(0, limit)
}

/**
 * Fetch all obligation account PDAs from the program for a specific market
 * This performs a full scan of all obligations on-chain filtered by market
 */
export async function scanAllObligations(
  connection: Connection,
  marketPubkey: PublicKey,
): Promise<string[]> {
  const programId = new PublicKey(ZODIAL_V2_PROGRAM_ID)

  // Create filters for obligation accounts
  const filters: GetProgramAccountsFilter[] = [
    {
      memcmp: {
        bytes: bs58.encode(OBLIGATION_DISCRIMINATOR),
        offset: 0,
      },
    },
    {
      memcmp: {
        bytes: marketPubkey.toBase58(),
        offset: 8,
      },
    },
  ]

  console.log(
    `[ObligationScanner] Starting full obligation scan for market: ${marketPubkey.toBase58()}`,
  )

  const accounts = await connection.getProgramAccounts(programId, {
    dataSlice: {
      length: 0,
      offset: 0,
    },
    filters,
  })

  const pdas = accounts.map((acc) => acc.pubkey.toBase58())
  console.log(`[ObligationScanner] Found ${pdas.length} obligations for market`)

  return pdas
}

/**
 * Complete scan and leaderboard generation
 */
export async function scanAndGenerateLeaderboard(
  rpcUrl: string,
  marketPubkey: PublicKey,
  poolFactors: Map<string, PoolFactors>,
  assetPrices: Map<string, number>,
  assetDecimals: Map<string, number>,
  limit = 100,
): Promise<ObligationScanResult> {
  const connection = new Connection(rpcUrl, "confirmed")

  const obligationPdas = await scanAllObligations(connection, marketPubkey)

  const obligations = await fetchObligationAccounts(rpcUrl, obligationPdas)

  const leaderboard = generateLeaderboard(
    obligations,
    poolFactors,
    assetPrices,
    assetDecimals,
    limit,
  )

  return {
    leaderboard,
    obligationPdas,
    scannedAt: Date.now(),
  }
}
