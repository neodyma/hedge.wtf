"use client"

import { publicKey as toPk } from "@metaplex-foundation/umi"
import { useQuery } from "@tanstack/react-query"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"

import { qk } from "@/hooks/umi/keys"
import { deriveAta } from "@/lib/umi/pda-utils"
import { useProgramId, useUmi } from "@/providers/UmiContext"

import { useSolanaWallet } from "../useSolanaWallet"

const AMOUNT_OFFSET = 64
const AMOUNT_SIZE = 8

export interface UseWalletBalancesOptions {
  enabled?: boolean
  staleTimeMs?: number
}

export interface WalletBalance {
  amountUi: number
  assetIndex: number
  mint: string
}

/**
 * Fetch SPL token balances for every asset listed in the on-chain registry for
 * the connected wallet. Returns UI amounts
 */
export function useWalletBalances(
  registry: AssetRegistry | null | undefined,
  options?: UseWalletBalancesOptions,
) {
  const { address: publicKey } = useSolanaWallet()
  const umi = useUmi()
  const pid = useProgramId()
  const owner = publicKey?.toString() ?? ""

  return useQuery({
    enabled: (options?.enabled ?? true) && Boolean(owner) && Boolean(registry),
    queryFn: async (): Promise<WalletBalance[]> => {
      if (!registry || !owner) return []

      const ownerPk = toPk(owner)
      const balances: WalletBalance[] = []

      for (const asset of registry.assets) {
        try {
          const ata = deriveAta(umi, ownerPk, asset.mint)
          const account = await umi.rpc.getAccount(ata)

          if (!account.exists) continue

          const rawAmount = decodeTokenAmount(account.data)
          if (rawAmount === 0n) continue

          balances.push({
            amountUi: toUiAmount(rawAmount, asset.decimals),
            assetIndex: asset.index,
            mint: asset.mint.toString(),
          })
        } catch (error) {
          console.debug("[useWalletBalances] Unable to fetch balance for asset", asset.index, error)
        }
      }

      balances.sort((a, b) => b.amountUi - a.amountUi)
      return balances
    },
    queryKey: owner ? qk.walletBalances(pid, owner) : [...qk.scope(pid), "walletBalances", "anon"],
    staleTime: options?.staleTimeMs ?? 10_000,
  })
}

function decodeTokenAmount(data: Uint8Array): bigint {
  if (data.length < AMOUNT_OFFSET + AMOUNT_SIZE) return 0n
  let amount = 0n
  for (let i = 0; i < AMOUNT_SIZE; i++) {
    const byte = data[AMOUNT_OFFSET + i]
    amount |= BigInt(byte) << (BigInt(i) * 8n)
  }
  return amount
}

function toUiAmount(raw: bigint, decimals: number): number {
  if (raw === 0n) return 0
  const divisor = Math.pow(10, decimals)
  return Number(raw) / divisor
}
