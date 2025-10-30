import type { Signer, UmiPlugin } from "@metaplex-foundation/umi"

import {
  createSignerFromWalletAdapter,
  type WalletAdapter as UmiWalletAdapter,
  walletAdapterIdentity,
} from "@metaplex-foundation/umi-signer-wallet-adapters"
import { useAppKitAccount, useAppKitNetwork, useAppKitProvider } from "@reown/appkit/react"
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js"
import bs58 from "bs58"
import { Buffer } from "buffer"
import { useMemo } from "react"

if (
  typeof globalThis !== "undefined" &&
  typeof (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer === "undefined"
) {
  ;(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer
}

type SolanaWalletProvider = {
  request?: (
    args: { method: string; params?: unknown },
    chainId?: number | string,
  ) => Promise<unknown>
  signAllTransactions?: (
    transactions: (Transaction | VersionedTransaction)[],
  ) => Promise<(Transaction | VersionedTransaction)[]>
  signTransaction?: (
    transaction: Transaction | VersionedTransaction,
  ) => Promise<Transaction | VersionedTransaction>
}

type WalletData = {
  address: null | string
  isConnected: boolean
  walletAdapter: null | UmiWalletAdapter
}

export function useSolanaWalletAdapter() {
  return useWalletData()
}

export function useSolanaWalletDirect(): WalletData & {
  identityPlugin: null | UmiPlugin
  signer: null | Signer
} {
  const data = useWalletData()

  const identityPlugin = useMemo(() => {
    if (!data.walletAdapter) return null
    return walletAdapterIdentity(data.walletAdapter)
  }, [data.walletAdapter])

  const signer = useMemo(() => {
    if (!data.walletAdapter) return null
    return createSignerFromWalletAdapter(data.walletAdapter)
  }, [data.walletAdapter])

  return {
    ...data,
    identityPlugin,
    signer,
  }
}

function useWalletData(): WalletData {
  const account = useAppKitAccount({ namespace: "solana" })
  const { walletProvider } = useAppKitProvider("solana")
  const solanaProvider = walletProvider as SolanaWalletProvider | undefined
  const { caipNetworkId } = useAppKitNetwork()

  const adapter = useMemo<null | UmiWalletAdapter>(() => {
    const address = account.address
    if (!solanaProvider || !address) return null

    let publicKey: PublicKey
    try {
      publicKey = new PublicKey(address)
    } catch {
      return null
    }

    const targetChainId = caipNetworkId ?? "solana:mainnet"

    const supportsDirectSigning = typeof solanaProvider.signTransaction === "function"
    const supportsRequest = typeof solanaProvider.request === "function"

    if (!supportsDirectSigning && !supportsRequest) return null

    const request = supportsRequest
      ? async <T>(method: string, params: unknown): Promise<T> => {
          const response = await solanaProvider.request!({ method, params }, targetChainId)
          return response as T
        }
      : null

    const decodeBytes = (value: string): Buffer => {
      const base64Re = /^[0-9A-Za-z+/=]+$/
      const looksBase64 = value.length % 4 === 0 && base64Re.test(value)
      if (looksBase64) {
        try {
          return Buffer.from(value, "base64")
        } catch {
          // fall back to base58
        }
      }
      return Buffer.from(bs58.decode(value))
    }

    const decodeSignedTransaction = <T extends Transaction | VersionedTransaction>(
      original: T,
      signedBase64: string,
    ): T => {
      const buffer = decodeBytes(signedBase64)
      if (original instanceof VersionedTransaction) {
        return VersionedTransaction.deserialize(buffer) as T
      }
      return Transaction.from(buffer) as T
    }

    const signTransactionViaRequest = async <T extends Transaction | VersionedTransaction>(
      transaction: T,
    ): Promise<T> => {
      if (!request) throw new Error("Wallet provider does not support request RPC method")

      const serialized = Buffer.from(
        transaction.serialize({ requireAllSignatures: false, verifySignatures: false }),
      ).toString("base64")

      const result = await request<string | { signedTransaction?: string; transaction?: string }>(
        "solana_signTransaction",
        {
          transaction: serialized,
        },
      )

      const signedBase64 =
        typeof result === "string"
          ? result
          : (result?.signedTransaction ?? result?.transaction ?? null)
      if (!signedBase64) {
        throw new Error("solana_signTransaction response missing signed transaction")
      }
      return decodeSignedTransaction(transaction, signedBase64)
    }

    const signAllTransactionsViaRequest = async <T extends Transaction | VersionedTransaction>(
      transactions: T[],
    ): Promise<T[]> => {
      if (!request) throw new Error("Wallet provider does not support request RPC method")

      const payloads = transactions.map((tx) =>
        Buffer.from(
          tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
        ).toString("base64"),
      )

      const result = await request<
        string[] | { signedTransactions?: string[]; transactions?: string[] }
      >("solana_signAllTransactions", {
        transactions: payloads,
      })

      const signedList = Array.isArray(result)
        ? result
        : (result?.signedTransactions ?? result?.transactions ?? null)
      if (!signedList) {
        throw new Error("solana_signAllTransactions response missing signed transactions")
      }
      return signedList.map((signed, index) =>
        decodeSignedTransaction(transactions[index], signed),
      ) as T[]
    }

    const signTransactionDirect = async <T extends Transaction | VersionedTransaction>(
      transaction: T,
    ): Promise<T> => {
      const signed = await solanaProvider.signTransaction!(transaction)
      return (signed ?? transaction) as T
    }

    const signAllTransactionsDirect = async <T extends Transaction | VersionedTransaction>(
      transactions: T[],
    ): Promise<T[]> => {
      if (typeof solanaProvider.signAllTransactions === "function") {
        const signedList = await solanaProvider.signAllTransactions(transactions)
        return signedList.map((signed, index) => (signed ?? transactions[index]) as T)
      }

      const results = []
      for (const tx of transactions) {
        results.push(await signTransactionDirect(tx))
      }
      return results
    }

    const adapterImpl: UmiWalletAdapter = {
      publicKey,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(
        transactions: T[],
      ) => {
        if (supportsDirectSigning) {
          return signAllTransactionsDirect(transactions)
        }
        return signAllTransactionsViaRequest(transactions)
      },
      signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T) => {
        if (supportsDirectSigning) {
          return signTransactionDirect(transaction)
        }
        return signTransactionViaRequest(transaction)
      },
    }

    return adapterImpl
  }, [account.address, caipNetworkId, solanaProvider])

  const isConnected =
    Boolean(account.isConnected ?? account.status === "connected") && Boolean(adapter)

  return {
    address: account.address ?? null,
    isConnected,
    walletAdapter: adapter,
  }
}

export const useSolanaWallet = useSolanaWalletAdapter
