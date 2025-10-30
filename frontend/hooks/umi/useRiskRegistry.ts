"use client"

import type { PublicKey as UmiPublicKey } from "@metaplex-foundation/umi"
import { useQuery } from "@tanstack/react-query"
import { safeFetchRiskRegistry, type RiskRegistry } from "@/clients/generated/accounts/riskRegistry"
import { useUmi, useProgramId } from "@/providers/UmiContext"
import { bytes, publicKey as publicKeySerializer } from "@metaplex-foundation/umi/serializers"
import { publicKey as toPk } from "@metaplex-foundation/umi"

const SEED_RISK_REG = new Uint8Array([114, 105, 115, 107, 45, 114, 101, 103]) // "risk-reg"

export function useRiskRegistryByMarket(
  market?: string | UmiPublicKey,
  opts?: {
    enabled?: boolean
    staleTimeMs?: number
  },
) {
  const umi = useUmi()
  const pid = useProgramId()

  const marketPk = typeof market === "string" ? toPk(market) : market
  const keyStr = marketPk ? marketPk.toString() : "none"

  return useQuery<RiskRegistry | null>({
    enabled: (opts?.enabled ?? true) && Boolean(marketPk),
    queryFn: async () => {
      if (!marketPk) return null

      // Derive RiskRegistry PDA
      const programId = toPk(pid)
      const [riskRegistryPda] = umi.eddsa.findPda(programId, [
        bytes().serialize(SEED_RISK_REG),
        publicKeySerializer().serialize(marketPk),
      ])

      // Fetch the account
      return safeFetchRiskRegistry(umi, riskRegistryPda)
    },
    queryKey: ["riskRegistry", pid, keyStr],
    staleTime: opts?.staleTimeMs ?? 15_000,
  })
}
