import type { Umi, PublicKey as UmiPublicKey } from "@metaplex-foundation/umi"

import { publicKey as toPk } from "@metaplex-foundation/umi"
import { bytes, publicKey as publicKeySerializer } from "@metaplex-foundation/umi/serializers"

const TOKEN_PROGRAM_ID = toPk("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
const ATA_PROGRAM_ID = toPk("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")

const SEED_OBLIGATION = new Uint8Array([111, 98, 108, 105, 103, 97, 116, 105, 111, 110]) // "obligation"
const SEED_FAUCET_MINT = new Uint8Array([102, 97, 117, 99, 101, 116, 45, 109, 105, 110, 116]) // "faucet-mint"

/**
 * Derive Associated Token Account (ATA) for owner + mint
 *
 * @param umi - Umi instance
 * @param owner - Owner public key
 * @param mint - Mint public key
 * @returns Derived ATA public key
 */
export function deriveAta(umi: Umi, owner: UmiPublicKey, mint: UmiPublicKey): UmiPublicKey {
  const [ata] = umi.eddsa.findPda(ATA_PROGRAM_ID, [
    publicKeySerializer().serialize(owner),
    publicKeySerializer().serialize(TOKEN_PROGRAM_ID),
    publicKeySerializer().serialize(mint),
  ])
  return ata
}

/**
 * Seeds: ["faucet-mint", market, mint]
 *
 * @param umi - Umi instance
 * @param programId - program ID
 * @param market - Market public key
 * @param mint - Mint public key
 * @returns Derived faucet mint PDA
 */
export function deriveFaucetMint(
  umi: Umi,
  programId: UmiPublicKey,
  market: UmiPublicKey,
  mint: UmiPublicKey,
): UmiPublicKey {
  const [faucetMint] = umi.eddsa.findPda(programId, [
    bytes().serialize(SEED_FAUCET_MINT),
    publicKeySerializer().serialize(market),
    publicKeySerializer().serialize(mint),
  ])
  return faucetMint
}

/**
 * Seeds: ["obligation", market, owner]
 *
 * @param umi - Umi instance
 * @param programId - program ID
 * @param market - Market public key
 * @param owner - Owner public key
 * @returns Derived obligation PDA
 */
export function deriveObligation(
  umi: Umi,
  programId: UmiPublicKey,
  market: UmiPublicKey,
  owner: UmiPublicKey,
): UmiPublicKey {
  const [obligation] = umi.eddsa.findPda(programId, [
    bytes().serialize(SEED_OBLIGATION),
    publicKeySerializer().serialize(market),
    publicKeySerializer().serialize(owner),
  ])
  return obligation
}

/**
 * Check if an Associated Token Account exists on-chain
 *
 * @param umi - Umi instance
 * @param owner - Owner public key
 * @param mint - Mint public key
 * @returns Object with ATA address and whether it needs creation
 */
export async function ensureAta(
  umi: Umi,
  owner: UmiPublicKey,
  mint: UmiPublicKey,
): Promise<{ ata: UmiPublicKey; needsCreation: boolean }> {
  const ata = deriveAta(umi, owner, mint)
  const account = await umi.rpc.getAccount(ata)

  return {
    ata,
    needsCreation: !account.exists,
  }
}

/**
 * Convert UI amount string to raw u64 bigint
 * Handles decimal precision and converts to atomic units
 *
 * @param uiAmount - Amount as string (e.g., "1.5")
 * @param decimals - Token decimals
 * @returns Raw amount as bigint, or null if invalid
 */
export function uiToRawU64(uiAmount: string, decimals: number): bigint | null {
  try {
    const trimmed = uiAmount.trim()
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null

    const parts = trimmed.split(".")
    const intPart = parts[0] ?? "0"
    const fracPartRaw = parts[1] ?? ""
    const fracPart = fracPartRaw.slice(0, decimals)
    const padded = fracPart + "0".repeat(Math.max(0, decimals - fracPart.length))
    const rawStr = `${intPart}${padded}`.replace(/^0+/, "") || "0"

    const U64_MAX = BigInt("18446744073709551615")
    const rawBigInt = BigInt(rawStr)
    if (rawBigInt > U64_MAX) return null

    return rawBigInt
  } catch {
    return null
  }
}
