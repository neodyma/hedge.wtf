"use client"

import { publicKey as toPk } from "@metaplex-foundation/umi"
import { base58 } from "@metaplex-foundation/umi/serializers"
import { useEffect, useMemo, useState } from "react"

import type { EnrichedPool } from "@/lib/umi/pool-utils"
import type { Asset } from "@/types/asset"
import type { Position } from "@/types/portfolio"

import { useTxOverlay } from "@/components/TxOverlay"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRepay, useWithdraw } from "@/hooks/umi/mutations"
import { useTokenAmountInputs } from "@/hooks/umi/useTokenAmountInputs"
import { useSolanaWallet } from "@/hooks/useSolanaWallet"
import { deriveAta, uiToRawU64 } from "@/lib/umi/pda-utils"
import { formatCurrency } from "@/lib/utils"
import { useUmi } from "@/providers/UmiContext"

type ObligationData = {
  borrows: { amount_ui: number; asset_id: number }[]
  deposits: { amount_ui: number; asset_id: number }[]
}

export default function WithdrawRepayDialog({
  allAssets,
  defaultAsset,
  enrichedPools,
  marketAuthority,
  mode,
  obligations,
  onOpenChange,
  onSuccess,
  open,
  selectedMarket,
}: {
  allAssets: Asset[]
  defaultAsset?: Asset | null
  enrichedPools: EnrichedPool[]
  marketAuthority: null | string
  mode: "repay" | "withdraw"
  obligations: ObligationData
  onOpenChange: (o: boolean) => void
  onSuccess: () => void
  open: boolean
  selectedMarket: null | string
}) {
  const umi = useUmi()
  const { address: walletPublicKey } = useSolanaWallet()
  const withdraw = useWithdraw()
  const repay = useRepay()
  const notify = useTxOverlay()

  const positions = useMemo(() => {
    const sourceList = mode === "withdraw" ? obligations.deposits : obligations.borrows
    const result: Position[] = []

    for (const item of sourceList) {
      const asset = allAssets.find((a) => a.cmc_id === item.asset_id)
      const amount = item.amount_ui ?? 0

      if (asset && amount > 0 && asset.price?.latest > 0) {
        result.push({ amount, asset })
      }
    }

    return result
  }, [mode, obligations, allAssets])

  // Only show assets that have positions
  const availableList = useMemo(() => {
    return positions.map((pos) => ({
      asset: pos.asset,
      available: pos.amount,
    }))
  }, [positions])

  const [symbol, setSymbol] = useState<string>(defaultAsset?.symbol ?? allAssets[0]?.symbol ?? "")

  useEffect(() => {
    if (!open) return
    if (!availableList.length) return
    const inList = availableList.some((x) => x.asset.symbol === symbol)
    if (!inList) {
      const fallback =
        (defaultAsset &&
          availableList.find((x) => x.asset.symbol === defaultAsset.symbol)?.asset.symbol) ??
        availableList[0].asset.symbol
      setSymbol(fallback)
    }
  }, [open, availableList, defaultAsset, symbol])

  const assetEntry = useMemo(
    () => availableList.find((x) => x.asset.symbol === symbol) ?? null,
    [availableList, symbol],
  )
  const asset = assetEntry?.asset ?? null
  const price = asset?.price.latest ?? 0
  const available = assetEntry?.available ?? 0

  const amountCtrl = useTokenAmountInputs({
    autoSelectMax: true,
    isDialogOpen: open,
    maxAmount: available,
    price,
    resetDeps: [symbol, mode],
  })

  const {
    reset: resetInputs,
    setPercentage,
    setTokenInput,
    setUsdInput,
    tokenAmount,
    tokenInput,
    usdAmount,
    usdInput,
  } = amountCtrl

  const disabledReason = !asset
    ? availableList.length === 0
      ? mode === "withdraw"
        ? "No deposits available to withdraw"
        : "No borrows available to repay"
      : "Select an asset"
    : tokenAmount <= 0
      ? "Enter an amount"
      : tokenAmount > available
        ? mode === "withdraw"
          ? "Amount exceeds deposit"
          : "Amount exceeds borrow"
        : null

  const [submitting, setSubmitting] = useState(false)
  const submit = async () => {
    if (!asset || disabledReason || !walletPublicKey || !selectedMarket || !marketAuthority) {
      console.error("Missing required data for transaction:", {
        asset: !!asset,
        disabledReason,
        marketAuthority: !!marketAuthority,
        selectedMarket: !!selectedMarket,
        walletPublicKey: !!walletPublicKey,
      })
      return
    }

    setSubmitting(true)
    try {
      const pool = enrichedPools.find(
        (p) =>
          p.pool.mint.toString() === asset.mint ||
          p.assetMeta?.index === asset.index ||
          p.assetMeta?.index === asset.cmc_id,
      )

      if (!pool) {
        throw new Error(`Pool not found for asset ${asset.symbol}`)
      }

      const rawAmount = uiToRawU64(tokenAmount.toString(), asset.decimals)
      if (!rawAmount) {
        throw new Error(`Invalid amount conversion for ${tokenAmount}`)
      }

      const owner = toPk(walletPublicKey.toString())
      const market = toPk(selectedMarket)
      const ownerAta = deriveAta(umi, owner, pool.pool.mint)

      // For health calculation, pass all pools that user has positions in
      const remainingPools = enrichedPools
        .filter((p) => {
          // Include pools where user has deposits or borrows
          const hasDeposit = obligations.deposits.some(
            (d) => p.assetMeta?.index === d.asset_id && d.amount_ui > 0,
          )
          const hasBorrow = obligations.borrows.some(
            (b) => p.assetMeta?.index === b.asset_id && b.amount_ui > 0,
          )
          return (
            (hasDeposit || hasBorrow) &&
            p.pool.publicKey.toString() !== pool.pool.publicKey.toString()
          )
        })
        .map((p) => ({ publicKey: p.pool.publicKey.toString() }))

      let signature
      if (mode === "withdraw") {
        signature = await withdraw.mutateAsync({
          amount: rawAmount,
          authority: toPk(marketAuthority),
          market,
          owner: umi.identity,
          ownerTokenAta: ownerAta,
          pool: pool.pool.publicKey,
          poolVault: pool.pool.vault,
          remainingPools,
        })
      } else {
        signature = await repay.mutateAsync({
          amount: rawAmount,
          authority: toPk(marketAuthority),
          market,
          owner: umi.identity,
          ownerTokenAta: ownerAta,
          pool: pool.pool.publicKey,
          poolVault: pool.pool.vault,
        })
      }

      const signatureBase58 = base58.deserialize(signature)[0]
      notify({
        label: mode === "withdraw" ? "Withdraw" : "Repay",
        signature: signatureBase58,
      })

      onOpenChange(false)
      resetInputs()

      setTimeout(() => {
        onSuccess()
      }, 10000)
    } catch (error) {
      console.error(`${mode} error:`, error)
      alert(`Error: ${error}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="border-foreground bg-popover text-popover-foreground rounded-sm border-2 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">{mode}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <div className="text-muted-foreground mb-1">Asset</div>
            <Select disabled={!availableList.length} onValueChange={setSymbol} value={symbol}>
              <SelectTrigger className="bg-input w-full">
                <SelectValue placeholder={availableList.length ? "Asset" : "No available assets"} />
              </SelectTrigger>
              <SelectContent className="bg-input">
                {availableList.map(({ asset }) => (
                  <SelectItem className="bg-input" key={asset.symbol} value={asset.symbol}>
                    {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-muted-foreground mt-1 text-xs">
              {mode === "withdraw" ? "Deposited" : "Borrowed"}: {available.toFixed(4)}{" "}
              {asset?.symbol} · {formatCurrency(available * price, 2)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground mb-1">{asset?.symbol ?? "Amount"}</div>
              <Input
                className="no-spinner border-border bg-input focus:border-border focus:ring-ring w-full rounded-md border px-3 py-2 text-right font-medium focus:ring-1"
                disabled={!asset}
                inputMode="decimal"
                onBlur={() => setTokenInput(tokenAmount ? tokenAmount.toString() : "")}
                onChange={(e) => {
                  const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, "")
                  setTokenInput(cleaned)
                }}
                placeholder="0.00"
                type="text"
                value={tokenInput}
              />
              <div className="text-muted-foreground/80 mt-1 text-xs">
                ≈ {formatCurrency(usdAmount, 2)}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground mb-1">USD</div>
              <Input
                className="no-spinner border-border bg-input focus:border-border focus:ring-ring w-full rounded-md border px-3 py-2 text-right font-medium focus:ring-1"
                disabled={!asset}
                inputMode="decimal"
                onBlur={() => setUsdInput(usdAmount ? usdAmount.toString() : "")}
                onChange={(e) => {
                  const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, "")
                  setUsdInput(cleaned)
                }}
                placeholder={formatCurrency(usdAmount, 2)}
                type="text"
                value={usdInput}
              />
              <div className="text-muted-foreground/80 mt-1 text-xs">
                ≈ {tokenAmount.toFixed(6)} {asset?.symbol}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-xs">Quick amounts</div>
            <div className="flex gap-2">
              <Button
                className="bg-muted-foreground text-primary-foreground h-8 px-2"
                disabled={!asset}
                onClick={() => setPercentage(1)}
                size="sm"
                variant="outline"
              >
                Max
              </Button>
            </div>
          </div>

          <div className="border-border bg-input rounded-md border p-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">You will {mode}</span>
              <span className="font-medium">
                {tokenAmount.toFixed(6)} {asset?.symbol} ({formatCurrency(usdAmount, 2)})
              </span>
            </div>
            {!!disabledReason && (
              <div className="text-destructive mt-2 text-xs">{disabledReason}</div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button className="hover:bg-muted" onClick={() => onOpenChange(false)} variant="ghost">
              Cancel
            </Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!!disabledReason || submitting}
              onClick={submit}
            >
              {submitting
                ? mode === "withdraw"
                  ? "Withdrawing…"
                  : "Repaying…"
                : mode === "withdraw"
                  ? "Withdraw"
                  : "Repay"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
