import { Asset } from "@/types/asset"

export type Position = {
  amount: number
  asset: Asset
}

export type WalletTokenBalance = {
  amount_ui: number
  asset_id: number
  mint: string
}

export type ObligationTokenPosition = {
  amount_ui: number
  asset_id: number
  initial_amount_ui: number
  mint: string
}

export type ObligationAmounts = {
  borrows: ObligationTokenPosition[]
  deposits: ObligationTokenPosition[]
}
