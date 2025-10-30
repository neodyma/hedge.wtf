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
import { isValidPrice, safeMultiply } from "@/lib/utils"

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
 *
 * Applies robust filtering to drop invalid positions:
 * - Positions with zero shares
 * - Positions with missing pool factors
 * - Positions with invalid prices (zero, negative, or non-finite)
 * - Positions with non-finite amounts after conversion
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

    // Skip positions with zero shares early
    if (position.depositSharesQ60 === 0n && position.borrowSharesQ60 === 0n) {
      continue
    }

    // Get pool factors - skip if missing
    const pool = poolFactors.get(mintStr)
    if (!pool) {
      console.warn(`[ObligationScanner] Dropping position - no pool factors for ${mintStr}`)
      continue
    }

    // Get price with validation - skip if invalid
    const price = assetPrices.get(mintStr)
    if (!isValidPrice(price)) {
      console.warn(`[ObligationScanner] Dropping position - invalid price for ${mintStr}: ${price}`)
      continue
    }

    const decimals = assetDecimals.get(mintStr) ?? 6

    // Process deposits
    if (position.depositSharesQ60 > 0n) {
      const depositAmount = sharesToAmount(position.depositSharesQ60, pool.depositFacQ60, decimals)

      // Validate amount is finite
      if (!Number.isFinite(depositAmount) || depositAmount <= 0) {
        console.warn(
          `[ObligationScanner] Dropping deposit - invalid amount for ${mintStr}: ${depositAmount}`,
        )
        continue
      }

      // Safe multiplication with finite check
      const depositValue = safeMultiply(depositAmount, price!)
      totalDepositsUsd += depositValue
    }

    // Process borrows
    if (position.borrowSharesQ60 > 0n) {
      const borrowAmount = sharesToAmount(position.borrowSharesQ60, pool.borrowFacQ60, decimals)

      // Validate amount is finite
      if (!Number.isFinite(borrowAmount) || borrowAmount <= 0) {
        console.warn(
          `[ObligationScanner] Dropping borrow - invalid amount for ${mintStr}: ${borrowAmount}`,
        )
        continue
      }

      // Safe multiplication with finite check
      const borrowValue = safeMultiply(borrowAmount, price!)
      totalBorrowsUsd += borrowValue
    }
  }

  // Final validation of totals with fallback to 0
  const depositsUsd = Number.isFinite(totalDepositsUsd) ? totalDepositsUsd : 0
  const borrowsUsd = Number.isFinite(totalBorrowsUsd) ? totalBorrowsUsd : 0
  const portfolioValue = depositsUsd - borrowsUsd

  return {
    portfolioValue: Number.isFinite(portfolioValue) ? portfolioValue : 0,
    totalBorrowsUsd: borrowsUsd,
    totalDepositsUsd: depositsUsd,
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
 * Supports pagination via offset and limit parameters
 */
export function generateLeaderboard(
  obligations: Obligation[],
  poolFactors: Map<string, PoolFactors>,
  assetPrices: Map<string, number>,
  assetDecimals: Map<string, number>,
  offset = 0,
  limit = 100,
): { entries: LeaderboardEntry[]; totalEntries: number } {
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

  // Sort all entries by portfolio value descending
  entries.sort((a, b) => Number(b.portfolio_value) - Number(a.portfolio_value))

  // Return paginated slice and total count
  return {
    entries: entries.slice(offset, offset + limit),
    totalEntries: entries.length,
  }
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
 * Complete scan and leaderboard generation with pagination support
 */
export async function scanAndGenerateLeaderboard(
  rpcUrl: string,
  marketPubkey: PublicKey,
  poolFactors: Map<string, PoolFactors>,
  assetPrices: Map<string, number>,
  assetDecimals: Map<string, number>,
  offset = 0,
  limit = 100,
): Promise<ObligationScanResult & { totalEntries: number }> {
  const connection = new Connection(rpcUrl, "confirmed")

  const obligationPdas = await scanAllObligations(connection, marketPubkey)

  const obligations = await fetchObligationAccounts(rpcUrl, obligationPdas)

  const { entries, totalEntries } = generateLeaderboard(
    obligations,
    poolFactors,
    assetPrices,
    assetDecimals,
    offset,
    limit,
  )

  return {
    leaderboard: entries,
    obligationPdas,
    scannedAt: Date.now(),
    totalEntries,
  }
}
