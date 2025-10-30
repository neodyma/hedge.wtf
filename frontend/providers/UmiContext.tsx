"use client"

import type { Umi } from "@metaplex-foundation/umi"

import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters"
import { createContext, type PropsWithChildren, useContext } from "react"

import { useSolanaWallet } from "@/hooks/useSolanaWallet"

const UmiContext = createContext<null | Umi>(null)

export function UmiProvider({ children, umi }: PropsWithChildren<{ umi: Umi }>) {
  return <UmiContext.Provider value={umi}>{children}</UmiContext.Provider>
}

export function useProgramId(): string {
  const umi = useUmi()
  return umi.programs
    .getPublicKey("zodialV2", "5E1ikr753b8RQZdtohZAY8wmpjn2hu9dWzrN5xEasmtu")
    .toString()
}

export function useUmi(): Umi {
  const umi = useContext(UmiContext)
  const { isConnected, walletAdapter } = useSolanaWallet()

  if (isConnected && walletAdapter) umi?.use(walletAdapterIdentity(walletAdapter))
  if (!umi) throw new Error("UmiProvider missing in React tree.")
  return umi
}
