"use client"

import {
  generateSigner,
  signerIdentity,
  publicKey as toPk,
  type Umi,
} from "@metaplex-foundation/umi"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"

export function createDefaultUmi(
  endpoint?: string,
  opts?: {
    programId?: string
  },
): Umi {
  const resolvedEndpoint =
    endpoint ??
    process.env.NEXT_PUBLIC_RPC ??
    process.env.SOLANA_RPC_URL ??
    "https://api.devnet.solana.com"

  const umi = createUmi(resolvedEndpoint)

  umi.use(signerIdentity(generateSigner(umi)))

  if (opts?.programId) {
    umi.programs.add({
      getErrorFromCode: () => null,
      getErrorFromName: () => null,
      isOnCluster: () => true,
      name: "zodialV2",
      publicKey: toPk(opts.programId),
    })
  }

  return umi
}
