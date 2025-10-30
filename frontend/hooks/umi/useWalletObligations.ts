"use client"

import type { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi"

import { useObligationsByOwner } from "@/hooks/umi/queries"

import { useSolanaWallet } from "../useSolanaWallet"

export interface UseWalletObligationsOptions {
  enabled?: boolean
  market?: MaybePublicKey
  staleTimeMs?: number
}

type MaybePublicKey = null | string | UmiPublicKey | undefined

export function useWalletObligations(options?: UseWalletObligationsOptions) {
  const { address: publicKey } = useSolanaWallet()
  const owner = publicKey?.toString()

  return useObligationsByOwner(owner, {
    enabled: (options?.enabled ?? true) && Boolean(owner),
    market: options?.market ?? undefined,
    staleTimeMs: options?.staleTimeMs,
  })
}
