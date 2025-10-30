"use client"

import type { TransactionSignature, Umi } from "@metaplex-foundation/umi"

import { transactionBuilder } from "@metaplex-foundation/umi"
import { bytes, publicKey as pkSer } from "@metaplex-foundation/umi/serializers"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import {
  borrow,
  type BorrowInstructionAccounts,
  type BorrowInstructionArgs,
} from "@/clients/generated/instructions/borrow"
import {
  checkLiquidation,
  type CheckLiquidationInstructionAccounts,
} from "@/clients/generated/instructions/checkLiquidation"
import {
  deposit,
  type DepositInstructionAccounts,
  type DepositInstructionArgs,
} from "@/clients/generated/instructions/deposit"
import {
  faucet,
  type FaucetInstructionAccounts,
  type FaucetInstructionArgs,
} from "@/clients/generated/instructions/faucet"
import {
  faucetSwap,
  type FaucetSwapInstructionAccounts,
  type FaucetSwapInstructionArgs,
} from "@/clients/generated/instructions/faucetSwap"
import {
  initFaucetMint,
  type InitFaucetMintInstructionAccounts,
  type InitFaucetMintInstructionArgs,
} from "@/clients/generated/instructions/initFaucetMint"
import {
  initMarket,
  type InitMarketInstructionAccounts,
  type InitMarketInstructionArgs,
} from "@/clients/generated/instructions/initMarket"
import {
  initPool,
  type InitPoolInstructionAccounts,
  type InitPoolInstructionArgs,
} from "@/clients/generated/instructions/initPool"
import {
  leverageExistingDeposit,
  type LeverageExistingDepositInstructionAccounts,
  type LeverageExistingDepositInstructionArgs,
} from "@/clients/generated/instructions/leverageExistingDeposit"
import {
  registerAsset,
  type RegisterAssetInstructionAccounts,
  type RegisterAssetInstructionArgs,
} from "@/clients/generated/instructions/registerAsset"
import {
  repay,
  type RepayInstructionAccounts,
  type RepayInstructionArgs,
} from "@/clients/generated/instructions/repay"
import {
  setRiskPair,
  type SetRiskPairInstructionAccounts,
  type SetRiskPairInstructionArgs,
} from "@/clients/generated/instructions/setRiskPair"
import {
  updatePrices,
  type UpdatePricesInstructionAccounts,
  type UpdatePricesInstructionArgs,
} from "@/clients/generated/instructions/updatePrices"
import {
  withdraw,
  type WithdrawInstructionAccounts,
  type WithdrawInstructionArgs,
} from "@/clients/generated/instructions/withdraw"
import { invalidatePortfolioQueries } from "@/hooks/umi/portfolioInvalidation"
import { useProgramId, useUmi } from "@/providers/UmiContext"

const toBase58 = (value: unknown): null | string => {
  if (!value) return null
  if (typeof value === "string") return value
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>
    if (
      obj.publicKey &&
      typeof (obj.publicKey as { toString?: () => string }).toString === "function"
    ) {
      try {
        return (obj.publicKey as { toString: () => string }).toString()
      } catch {
        // ignore fallback to generic toString below
      }
    }
    if (typeof obj.toString === "function") {
      try {
        return (obj.toString as () => string)()
      } catch {
        // ignore
      }
    }
  }
  return null
}

const resolveOwner = (value: unknown, fallback: string): string => {
  return toBase58(value) ?? fallback
}

const resolveMarket = (value: unknown): null | string => {
  return toBase58(value)
}

// Debug data type (matches admin page interface)
export interface DebugData {
  derivedAccounts?: Record<string, string>
  inputAccounts: Record<string, string>
  instructionName: string
  timestamp: number
  txSignature: string
}

type TxSig = TransactionSignature

/** Borrow */
export function useBorrow() {
  const umi = useUmi()
  const pid = useProgramId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: BorrowInstructionAccounts &
        BorrowInstructionArgs & { remainingPools?: Array<{ publicKey: string }> },
    ): Promise<TxSig> => {
      const builder = borrow(umi, input)

      // Add remaining pool accounts for health calculation
      if (input.remainingPools && input.remainingPools.length > 0) {
        const { publicKey: toPk } = await import("@metaplex-foundation/umi")

        // Get the instruction from the builder
        const instructions = builder.getInstructions()
        if (instructions.length > 0) {
          const ix = instructions[0]

          // Add remaining accounts to the keys
          const remainingKeys = input.remainingPools.map((pool) => ({
            isSigner: false,
            isWritable: false,
            pubkey: toPk(pool.publicKey),
          }))

          if (ix.keys) {
            ix.keys = [...ix.keys, ...remainingKeys]
          }
        }
      }

      return sendAndConfirm(umi, builder)
    },
    onSuccess: async (_sig, variables) => {
      const owner = resolveOwner(variables.owner, umi.identity.publicKey.toString())
      const market = resolveMarket(variables.market)
      await invalidatePortfolioQueries(queryClient, pid, owner, market ?? undefined)
    },
  })
}

/** Liquidation check (write ix that may compute + emit) */
export function useCheckLiquidation() {
  const umi = useUmi()
  return useMutation({
    mutationFn: async (input: CheckLiquidationInstructionAccounts): Promise<TxSig> => {
      const b = checkLiquidation(umi, input)
      return sendAndConfirm(umi, b)
    },
  })
}

/** Deposit */
export function useDeposit() {
  const umi = useUmi()
  const pid = useProgramId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: DepositInstructionAccounts & DepositInstructionArgs,
    ): Promise<TxSig> => {
      const b = deposit(umi, input)
      return sendAndConfirm(umi, b)
    },
    onSuccess: async (_sig, variables) => {
      const owner = resolveOwner(variables.owner, umi.identity.publicKey.toString())
      const market = resolveMarket(variables.market)
      await invalidatePortfolioQueries(queryClient, pid, owner, market ?? undefined)
    },
  })
}

/** Faucet mint */
export function useFaucet() {
  const umi = useUmi()
  const pid = useProgramId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: FaucetInstructionAccounts & FaucetInstructionArgs,
    ): Promise<TxSig> => {
      const b = faucet(umi, input)
      return sendAndConfirm(umi, b)
    },
    onSuccess: async (_sig, variables) => {
      const owner = resolveOwner(variables.user, umi.identity.publicKey.toString())
      await invalidatePortfolioQueries(queryClient, pid, owner, null)
    },
  })
}

/** Faucet swap */
export function useFaucetSwap() {
  const umi = useUmi()
  const pid = useProgramId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: FaucetSwapInstructionAccounts & FaucetSwapInstructionArgs,
    ): Promise<TxSig> => {
      const b = faucetSwap(umi, input)
      return sendAndConfirm(umi, b)
    },
    onSuccess: async (_sig, variables) => {
      const owner = resolveOwner(variables.user, umi.identity.publicKey.toString())
      await invalidatePortfolioQueries(queryClient, pid, owner, null)
    },
  })
}
/** Admin: init faucet mint */
export function useInitFaucetMint(onDebug?: (data: DebugData) => void) {
  const umi = useUmi()
  const pid = useProgramId()
  return useMutation({
    mutationFn: async (
      input: InitFaucetMintInstructionAccounts & InitFaucetMintInstructionArgs,
    ): Promise<TxSig> => {
      console.log("=== initFaucetMint Debug ===")
      console.log("Input:", {
        authority: input.authority?.toString() || "default",
        decimals: input.decimals,
        faucetMint: input.faucetMint?.toString() || "default",
        market: input.market?.toString() || "default",
        mint: input.mint.publicKey.toString(),
        mintAuthority: input.mintAuthority?.toString() || "default",
        payer: input.payer?.toString() || "default",
      })

      // Mint account size for Token Program (82 bytes)
      const MINT_SIZE = 82

      // Get minimum rent exemption for mint account
      const connection = umi.rpc
      const rentExemption = await connection.getRent(MINT_SIZE)

      console.log("Mint account details:", {
        rentExemptionLamports: rentExemption.basisPoints.toString(),
        rentExemptionSol: Number(rentExemption.basisPoints) / 10000,
        size: MINT_SIZE,
      })

      // Get Token Program ID
      const TOKEN_PROGRAM_ID = umi.programs.getPublicKey(
        "tokenProgram",
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      )

      // Get System Program ID
      const SYSTEM_PROGRAM_ID = umi.programs.getPublicKey(
        "systemProgram",
        "11111111111111111111111111111111",
      )

      console.log("Creating mint account with:", {
        newAccount: input.mint.publicKey.toString(),
        payer: umi.payer.publicKey.toString(),
        programOwner: TOKEN_PROGRAM_ID.toString(),
        rentLamports: rentExemption.basisPoints.toString(),
        space: MINT_SIZE,
      })

      // Manually create the SystemProgram.createAccount instruction
      // This matches what the Anchor test does
      const { publicKey: publicKeySerializer, u64 } = await import(
        "@metaplex-foundation/umi/serializers"
      )

      // System Program CreateAccount instruction discriminator (0)
      const createAccountDiscriminator = new Uint8Array([0, 0, 0, 0])
      const lamportsData = u64().serialize(rentExemption.basisPoints)
      const spaceData = u64().serialize(BigInt(MINT_SIZE))
      const ownerData = publicKeySerializer().serialize(TOKEN_PROGRAM_ID)

      // Combine all data for createAccount instruction
      const createAccountData = new Uint8Array([
        ...createAccountDiscriminator,
        ...lamportsData,
        ...spaceData,
        ...ownerData,
      ])

      console.log("CreateAccount instruction data:", {
        discriminator: Array.from(createAccountDiscriminator),
        lamports: rentExemption.basisPoints.toString(),
        owner: TOKEN_PROGRAM_ID.toString(),
        space: MINT_SIZE,
        totalDataLength: createAccountData.length,
      })

      // Create the mint account first using System Program
      let builder = transactionBuilder().add({
        bytesCreatedOnChain: MINT_SIZE,
        instruction: {
          data: createAccountData,
          keys: [
            { isSigner: true, isWritable: true, pubkey: umi.payer.publicKey },
            { isSigner: true, isWritable: true, pubkey: input.mint.publicKey },
          ],
          programId: SYSTEM_PROGRAM_ID,
        },
        signers: [umi.payer, input.mint],
      })

      // Then add the initFaucetMint instruction
      builder = builder.add(initFaucetMint(umi, input))

      // WORKAROUND: The IDL incorrectly marks mint as not writable
      // We need to manually fix the account metas
      const instructions = builder.getInstructions()
      console.log("Built instructions count:", instructions.length)

      instructions.forEach((ix, idx) => {
        console.log(`\nInstruction ${idx}:`, {
          numKeys: ix.keys?.length || 0,
          programId: ix.programId.toString(),
        })

        // Find and fix the initFaucetMint instruction
        if (ix.keys && ix.keys.length >= 6) {
          const mintPubkey = input.mint.publicKey.toString()
          const mintKeyIndex = ix.keys.findIndex((k) => k.pubkey.toString() === mintPubkey)

          if (mintKeyIndex !== -1 && ix.keys[mintKeyIndex]) {
            console.log(`  Mint account at index ${mintKeyIndex} - Before fix:`, {
              isSigner: ix.keys[mintKeyIndex].isSigner,
              isWritable: ix.keys[mintKeyIndex].isWritable,
              pubkey: ix.keys[mintKeyIndex].pubkey.toString(),
            })

            // Fix: Mark mint as writable
            ix.keys[mintKeyIndex].isWritable = true

            console.log(`  Mint account at index ${mintKeyIndex} - After fix:`, {
              isSigner: ix.keys[mintKeyIndex].isSigner,
              isWritable: ix.keys[mintKeyIndex].isWritable,
              pubkey: ix.keys[mintKeyIndex].pubkey.toString(),
            })
          }
        }

        console.log(`  All accounts for instruction ${idx}:`)
        ix.keys?.forEach((k, i) => {
          console.log(
            `    [${i}] ${k.pubkey.toString().slice(0, 8)}... signer:${k.isSigner} writable:${k.isWritable}`,
          )
        })
      })

      console.log("\n=== Sending transaction ===")

      // Prepare debug data callback
      const debugCallback = onDebug
        ? async (txSig: TxSig) => {
            // Convert transaction signature (Uint8Array) to base58 string
            const { base58 } = await import("@metaplex-foundation/umi/serializers")
            const txSignatureBase58 = base58.deserialize(txSig)[0]

            console.log("=== Debug Callback Triggered ===")
            console.log("Transaction Signature:", txSignatureBase58)

            // Get derived PDAs
            const { publicKey: toPk } = await import("@metaplex-foundation/umi")
            const programId = toPk(pid)
            const SEED_MARKET = new Uint8Array([109, 97, 114, 107, 101, 116]) // "market"
            const SEED_FAUCET_MINT = new Uint8Array([
              102, 97, 117, 99, 101, 116, 45, 109, 105, 110, 116,
            ]) // "faucet-mint"

            // Derive market PDA
            const [marketPda] = umi.eddsa.findPda(programId, [
              bytes().serialize(SEED_MARKET),
              pkSer().serialize(umi.identity.publicKey),
            ])

            // Derive faucetMint PDA
            const [faucetMintPda] = umi.eddsa.findPda(programId, [
              bytes().serialize(SEED_FAUCET_MINT),
              pkSer().serialize(marketPda),
              pkSer().serialize(input.mint.publicKey),
            ])

            onDebug({
              derivedAccounts: {
                faucetMint: faucetMintPda.toString(),
                market: marketPda.toString(),
              },
              inputAccounts: {
                authority: umi.identity.publicKey.toString(),
                decimals: input.decimals.toString(),
                mint: input.mint.publicKey.toString(),
                payer: umi.payer.publicKey.toString(),
              },
              instructionName: "initFaucetMint",
              timestamp: Date.now(),
              txSignature: txSignatureBase58,
            })
          }
        : undefined

      return sendAndConfirm(umi, builder, debugCallback)
    },
  })
}

/** Admin: init market */
export function useInitMarket() {
  const umi = useUmi()
  return useMutation({
    mutationFn: async (
      input: InitMarketInstructionAccounts & InitMarketInstructionArgs,
    ): Promise<TxSig> => {
      const b = initMarket(umi, input)
      return sendAndConfirm(umi, b)
    },
  })
}
/** Admin: init pool */
export function useInitPool(onDebug?: (data: DebugData) => void) {
  const umi = useUmi()
  const pid = useProgramId()
  return useMutation({
    mutationFn: async (params: {
      accounts?: Partial<InitPoolInstructionAccounts> // pass only { mint } from UI
      args: InitPoolInstructionArgs // { rate, mint }
    }): Promise<TransactionSignature> => {
      const { publicKey: toPk } = await import("@metaplex-foundation/umi")
      const programId = toPk(pid)

      // Seeds used by the generated client (see generated file)
      const SEED_MARKET = new Uint8Array([109, 97, 114, 107, 101, 116]) // "market"
      const SEED_POOL = new Uint8Array([112, 111, 111, 108]) // "pool"

      const { bytes, publicKey: pkSer } = await import("@metaplex-foundation/umi/serializers")

      const mint = params.args.mint
      if (!mint) throw new Error("initPool: args.mint is required")

      // Derive market PDA (authority = umi.identity by default)
      const [marketPda] = umi.eddsa.findPda(programId, [
        bytes().serialize(SEED_MARKET),
        pkSer().serialize(umi.identity.publicKey),
      ])

      // Derive pool PDA = [SEED_POOL, market, mint]
      const [poolPda] = umi.eddsa.findPda(programId, [
        bytes().serialize(SEED_POOL),
        pkSer().serialize(marketPda),
        pkSer().serialize(mint),
      ])

      const accounts: InitPoolInstructionAccounts = {
        authority: umi.identity, // admin
        market: marketPda, // we provide to keep things consistent
        mint, // from args
        payer: umi.payer, // defaults ok
        pool: poolPda, // REQUIRED by generated client
        // vaultAuth/vault, tokenProgram, systemProgram are auto-derived/defaulted
        ...(params.accounts ?? {}),
      }

      const b = initPool(umi, accounts, params.args)

      // Log debug info BEFORE sending transaction (so it's available even on failure)
      if (onDebug) {
        console.log("\n=== InitPool Debug Info ===")
        console.log("Program ID used for derivation:", programId.toString())
        console.log("Identity (authority):", umi.identity.publicKey.toString())
        console.log("Derived Market PDA:", marketPda.toString())
        console.log("Derived Pool PDA:", poolPda.toString())
        console.log("Mint:", mint.toString())
        console.log("Rate Model:", params.args.rate)
        console.log("===========================\n")
      }

      try {
        const sig = await b.sendAndConfirm(umi)
        const { base58 } = await import("@metaplex-foundation/umi/serializers")
        const txSignatureBase58 = base58.deserialize(sig.signature)[0]

        // Call onDebug callback on success
        if (onDebug) {
          onDebug({
            derivedAccounts: {
              authority: umi.identity.publicKey.toString(),
              marketPda: marketPda.toString(),
              payer: umi.payer.publicKey.toString(),
              poolPda: poolPda.toString(),
              programId: programId.toString(),
            },
            inputAccounts: {
              mint: mint.toString(),
            },
            instructionName: "initPool",
            timestamp: Date.now(),
            txSignature: txSignatureBase58,
          })
        }

        return sig.signature
      } catch (error) {
        // Log debug info on error
        console.error("\n=== InitPool Transaction Failed ===")
        console.error("Error:", error)
        console.error("Debug Info:")
        console.error("  Program ID:", programId.toString())
        console.error("  Market PDA:", marketPda.toString())
        console.error("  Pool PDA:", poolPda.toString())
        console.error("  Mint:", mint.toString())
        console.error("  Authority:", umi.identity.publicKey.toString())
        console.error("  Payer:", umi.payer.publicKey.toString())
        console.error("===================================\n")
        throw error
      }
    },
  })
}

/** One-click leverage */
export function useLeverageExistingDeposit() {
  const umi = useUmi()
  return useMutation({
    mutationFn: async (
      input: LeverageExistingDepositInstructionAccounts & LeverageExistingDepositInstructionArgs,
    ): Promise<TxSig> => {
      const b = leverageExistingDeposit(umi, input)
      return sendAndConfirm(umi, b)
    },
  })
}

/** Admin: register asset */
export function useRegisterAsset() {
  const umi = useUmi()
  return useMutation({
    mutationFn: async (
      input: RegisterAssetInstructionAccounts & RegisterAssetInstructionArgs,
    ): Promise<TxSig> => {
      const b = registerAsset(umi, input)
      return sendAndConfirm(umi, b)
    },
  })
}

/** Repay */
export function useRepay() {
  const umi = useUmi()
  const pid = useProgramId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: RepayInstructionAccounts & RepayInstructionArgs): Promise<TxSig> => {
      const b = repay(umi, input)
      return sendAndConfirm(umi, b)
    },
    onSuccess: async (_sig, variables) => {
      const owner = resolveOwner(variables.owner, umi.identity.publicKey.toString())
      const market = resolveMarket(variables.market)
      await invalidatePortfolioQueries(queryClient, pid, owner, market ?? undefined)
    },
  })
}

/** Admin: set risk pair */
export function useSetRiskPair() {
  const umi = useUmi()
  return useMutation({
    mutationFn: async (
      input: SetRiskPairInstructionAccounts & SetRiskPairInstructionArgs,
    ): Promise<TxSig> => {
      const b = setRiskPair(umi, input)
      return sendAndConfirm(umi, b)
    },
  })
}

/** Admin: update prices */
export function useUpdatePrices() {
  const umi = useUmi()
  return useMutation({
    mutationFn: async (
      input: UpdatePricesInstructionAccounts & UpdatePricesInstructionArgs,
    ): Promise<TxSig> => {
      const b = updatePrices(umi, input)
      return sendAndConfirm(umi, b)
    },
  })
}

/** Withdraw */
export function useWithdraw() {
  const umi = useUmi()
  const pid = useProgramId()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: WithdrawInstructionAccounts &
        WithdrawInstructionArgs & { remainingPools?: Array<{ publicKey: string }> },
    ): Promise<TxSig> => {
      const builder = withdraw(umi, input)

      // Add remaining pool accounts for health calculation
      if (input.remainingPools && input.remainingPools.length > 0) {
        const { publicKey: toPk } = await import("@metaplex-foundation/umi")

        // Get the instruction from the builder
        const instructions = builder.getInstructions()
        if (instructions.length > 0) {
          const ix = instructions[0]

          // Add remaining accounts to the keys
          const remainingKeys = input.remainingPools.map((pool) => ({
            isSigner: false,
            isWritable: false,
            pubkey: toPk(pool.publicKey),
          }))

          if (ix.keys) {
            ix.keys = [...ix.keys, ...remainingKeys]
          }
        }
      }

      return sendAndConfirm(umi, builder)
    },
    onSuccess: async (_sig, variables) => {
      const owner = resolveOwner(variables.owner, umi.identity.publicKey.toString())
      const market = resolveMarket(variables.market)
      await invalidatePortfolioQueries(queryClient, pid, owner, market ?? undefined)
    },
  })
}

/** Internal: send and confirm a builder, return its signature. */
async function sendAndConfirm(
  umi: Umi,
  builder: ReturnType<typeof transactionBuilder>,
  debugCallback?: (sig: TxSig) => void,
): Promise<TxSig> {
  // Umi's TransactionBuilder has .sendAndConfirm(umi, opts?). The return type is Signature (Uint8Array).
  const sig = await builder.sendAndConfirm(umi) // TS cannot refine builder union here; result is Signature.
  const txSig = sig.signature

  // Call debug callback if provided
  if (debugCallback) {
    debugCallback(txSig)
  }

  return txSig
}
