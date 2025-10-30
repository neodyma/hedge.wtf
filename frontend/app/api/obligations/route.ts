/**
 * API Route: Get all obligations for a specific market
 *
 * Query Parameters:
 * - market: Market public key (required)
 * - owner: Filter by owner (optional)
 *
 * Example:
 * GET /api/obligations?market=7yhdt2wccHmcicRJpGxn42xTRC8yUnmz5qMFhmWYvsZA
 * GET /api/obligations?market=7yhdt2wccHmcicRJpGxn42xTRC8yUnmz5qMFhmWYvsZA&owner=FUrDg...
 */

import { type RpcAccount, publicKey as toPk } from "@metaplex-foundation/umi"
import { Connection, GetProgramAccountsFilter, PublicKey } from "@solana/web3.js"
import { NextRequest, NextResponse } from "next/server"

import { deserializeObligation } from "@/clients/generated/accounts/obligation"
import { ZODIAL_V2_PROGRAM_ID } from "@/clients/generated/programs/zodialV2"

// Obligation discriminator (first 8 bytes)
const OBLIGATION_DISCRIMINATOR = new Uint8Array([168, 206, 141, 106, 88, 76, 172, 167])

// RPC URL
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC ??
  process.env.SOLANA_RPC_URL ??
  "https://api.devnet.solana.com"

/**
 * Get all obligations for a market using getProgramAccounts with filters
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const marketParam = searchParams.get("market")
    const ownerParam = searchParams.get("owner")

    // Validate required parameters
    if (!marketParam) {
      return NextResponse.json({ error: "Missing required parameter: market" }, { status: 400 })
    }

    // Validate public keys
    let marketPubkey: PublicKey
    let ownerPubkey: null | PublicKey = null

    try {
      marketPubkey = new PublicKey(marketParam)
      if (ownerParam) {
        ownerPubkey = new PublicKey(ownerParam)
      }
    } catch {
      return NextResponse.json({ error: "Invalid public key format" }, { status: 400 })
    }

    const connection = new Connection(RPC_URL, "confirmed")
    const programId = new PublicKey(ZODIAL_V2_PROGRAM_ID)

    console.log(`[ObligationsAPI] Fetching obligations for market: ${marketParam}`)

    // Build filters
    const filters: GetProgramAccountsFilter[] = [
      // Filter 1: Match obligation discriminator (offset 0, 8 bytes)
      {
        memcmp: {
          bytes: Buffer.from(OBLIGATION_DISCRIMINATOR).toString("base64"),
          offset: 0,
        },
      },
      // Filter 2: Match market pubkey (offset 8, 32 bytes)
      {
        memcmp: {
          bytes: marketPubkey.toBase58(),
          offset: 8,
        },
      },
    ]

    // Filter 3: Optional - Match owner pubkey (offset 40, 32 bytes)
    if (ownerPubkey) {
      filters.push({
        memcmp: {
          bytes: ownerPubkey.toBase58(),
          offset: 40,
        },
      })
    }

    // Fetch program accounts with filters
    const accounts = await connection.getProgramAccounts(programId, {
      filters,
    })

    console.log(`[ObligationsAPI] Found ${accounts.length} obligations`)

    // Deserialize accounts
    const obligations = accounts
      .map((account) => {
        try {
          const rpcAccount: RpcAccount = {
            data: new Uint8Array(account.account.data),
            executable: account.account.executable,
            lamports: {
              basisPoints: BigInt(account.account.lamports),
              decimals: 9,
              identifier: "SOL",
            },
            owner: toPk(account.account.owner.toBase58()),
            publicKey: toPk(account.pubkey.toBase58()),
            rentEpoch: BigInt(account.account.rentEpoch || 0),
          }

          const obligation = deserializeObligation(rpcAccount)

          return {
            bump: obligation.bump,
            market: obligation.market.toString(),
            owner: obligation.owner.toString(),
            positions: obligation.positions.map((p) => ({
              borrowSharesQ60: p.borrowSharesQ60.toString(),
              depositSharesQ60: p.depositSharesQ60.toString(),
              mint: p.mint.toString(),
            })),
            publicKey: account.pubkey.toBase58(),
          }
        } catch (error) {
          console.error(`[ObligationsAPI] Failed to deserialize obligation:`, error)
          return null
        }
      })
      .filter(Boolean)

    return NextResponse.json(
      {
        count: obligations.length,
        market: marketParam,
        obligations,
        owner: ownerParam || null,
        success: true,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
        status: 200,
      },
    )
  } catch (error) {
    console.error("[ObligationsAPI] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch obligations",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
