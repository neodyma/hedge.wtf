"use client"

import { publicKey as toPk } from "@metaplex-foundation/umi"
import { base58 } from "@metaplex-foundation/umi/serializers"
import { useCallback, useEffect, useMemo, useState } from "react"

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
import { useBorrow, useDeposit } from "@/hooks/umi/mutations"
import { useTokenAmountInputs } from "@/hooks/umi/useTokenAmountInputs"
import { type Mode, useAvailableAssets } from "@/hooks/useAvailableAssets"
import { useSolanaWallet } from "@/hooks/useSolanaWallet"
import { getBorrowAmount } from "@/lib/portfolio"
import { deriveAta, uiToRawU64 } from "@/lib/umi/pda-utils"
import { formatCurrency } from "@/lib/utils"
import { useUmi } from "@/providers/UmiContext"

type ObligationData = {
  borrows: { amount_ui: number; asset_id: number }[]
  deposits: { amount_ui: number; asset_id: number }[]
}

type WalletBalance = {
  amount_ui: number
  asset_id: number
}

export default function TokenActionDialog({
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
  walletBalances,
}: {
  allAssets: Asset[]
  defaultAsset?: Asset | null
  enrichedPools: EnrichedPool[]
  marketAuthority: null | string
  mode: Mode
  obligations: ObligationData
  onOpenChange: (o: boolean) => void
  onSuccess: () => void
  open: boolean
  selectedMarket: null | string
  walletBalances: WalletBalance[]
}) {
  const umi = useUmi()
  const { address: walletPublicKey } = useSolanaWallet()
  const deposit = useDeposit()
  const borrow = useBorrow()
  const notify = useTxOverlay()

  const { availableOf, list: availableList } = useAvailableAssets(
    mode,
    allAssets,
    walletBalances,
    enrichedPools,
    { epsilon: 1e-9 },
  )

  // Convert obligations to Position format for getBorrowAmount
  const { borrows, deposits } = useMemo(() => {
    const deposits: Position[] = []
    const borrows: Position[] = []

    if (!obligations || !allAssets) {
      console.log("[Position Parse] Missing data:", {
        hasAssets: !!allAssets,
        hasObligations: !!obligations,
      })
      return { borrows, deposits }
    }

    console.log("[Position Parse] Raw obligations:", {
      borrows: obligations.borrows,
      deposits: obligations.deposits,
    })
    console.log(
      "[Position Parse] Available asset IDs:",
      allAssets.map((a) => a.cmc_id),
    )

    for (const dep of obligations.deposits) {
      const asset = allAssets.find((a) => a.cmc_id === dep.asset_id)
      const amount = dep.amount_ui ?? 0

      if (asset && amount > 0 && asset.price?.latest > 0) {
        deposits.push({ amount, asset })
      } else {
        console.warn("[Position Parse] Skipping deposit:", {
          amount,
          asset_id: dep.asset_id,
          found: !!asset,
          price: asset?.price?.latest,
          symbol: asset?.symbol,
        })
      }
    }

    for (const bor of obligations.borrows) {
      const asset = allAssets.find((a) => a.cmc_id === bor.asset_id)
      const amount = bor.amount_ui ?? 0

      if (asset && amount > 0 && asset.price?.latest > 0) {
        borrows.push({ amount, asset })
      } else {
        console.warn("[Position Parse] Skipping borrow:", {
          amount,
          asset_id: bor.asset_id,
          found: !!asset,
          price: asset?.price?.latest,
          symbol: asset?.symbol,
        })
      }
    }

    console.log(
      "[Position Parse] Final deposits:",
      deposits.map((d) => `${d.amount} ${d.asset.symbol} @ $${d.asset.price.latest}`),
    )
    console.log(
      "[Position Parse] Final borrows:",
      borrows.map((b) => `${b.amount} ${b.asset.symbol} @ $${b.asset.price.latest}`),
    )

    return { borrows, deposits }
  }, [obligations, allAssets])

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
  const available = asset ? availableOf(asset.cmc_id) : 0

  const amountCtrl = useTokenAmountInputs({
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

  // Calculate safe and max borrow amounts for borrow mode
  const { maxBorrowAmount, safeBorrowAmount } = useMemo(() => {
    if (mode !== "borrow" || !asset || !deposits.length) {
      console.log("[Borrow Calc] Skipping calculation:", {
        depositsLength: deposits.length,
        hasAsset: !!asset,
        mode,
      })
      return { maxBorrowAmount: 0, safeBorrowAmount: 0 }
    }

    console.log("[Borrow Calc] Calculating for asset:", asset.symbol)
    console.log(
      "[Borrow Calc] Deposits:",
      deposits.map((d) => `${d.amount} ${d.asset.symbol}`),
    )
    console.log(
      "[Borrow Calc] Current borrows:",
      borrows.map((b) => `${b.amount} ${b.asset.symbol}`),
    )

    const safe = getBorrowAmount(deposits, borrows, asset, 1.5)
    const max = getBorrowAmount(deposits, borrows, asset, 1.0)

    console.log("[Borrow Calc] Safe borrow amount (health=1.5):", safe, asset.symbol)
    console.log("[Borrow Calc] Max borrow amount (health=1.0):", max, asset.symbol)
    console.log("[Borrow Calc] Pool liquidity:", available, asset.symbol)

    return { maxBorrowAmount: max, safeBorrowAmount: safe }
  }, [mode, asset, deposits, borrows, available])

  const clampToAvailable = useCallback(
    (value: number) => Math.max(0, Math.min(available, value)),
    [available],
  )

  const setSafeBorrow = () => {
    if (mode === "borrow" && asset) {
      console.log("[Safe Button] Clicked - Raw safe amount:", safeBorrowAmount)
      const clamped = clampToAvailable(safeBorrowAmount)
      console.log("[Safe Button] After clamping to pool liquidity:", clamped)
      setTokenInput(clamped > 0 ? clamped.toString() : "")
    }
  }

  const setMaxBorrow = () => {
    if (mode === "borrow" && asset) {
      console.log("[Max Button] Clicked - Raw max amount:", maxBorrowAmount)
      const clamped = clampToAvailable(maxBorrowAmount)
      console.log("[Max Button] After clamping to pool liquidity:", clamped)
      setTokenInput(clamped > 0 ? clamped.toString() : "")
    }
  }

  // Default to MAX on open
  useEffect(() => {
    if (!open || !asset) return
    if (tokenInput) return

    if (mode === "borrow" && deposits.length > 0) {
      // For borrow mode with deposits, use health-based max
      console.log("[Default Value] Setting max borrow based on health score")
      const max = clampToAvailable(maxBorrowAmount)
      if (max > 0) setTokenInput(max.toString())
    } else {
      // For deposit mode or borrow without deposits, use available
      const max = Math.max(0, available)
      if (max > 0) setTokenInput(max.toString())
    }
  }, [
    open,
    asset,
    available,
    tokenInput,
    setTokenInput,
    mode,
    deposits.length,
    maxBorrowAmount,
    clampToAvailable,
  ])

  const disabledReason = !asset
    ? availableList.length === 0
      ? mode === "deposit"
        ? "No wallet balances available to deposit"
        : "No pool liquidity available to borrow"
      : "Select an asset"
    : tokenAmount <= 0
      ? "Enter an amount"
      : tokenAmount > available
        ? mode === "deposit"
          ? "Insufficient wallet balance"
          : "Insufficient pool liquidity"
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

      let signature
      if (mode === "deposit") {
        signature = await deposit.mutateAsync({
          amount: rawAmount,
          authority: toPk(marketAuthority),
          market,
          owner: umi.identity,
          ownerTokenAta: ownerAta,
          pool: pool.pool.publicKey,
          poolVault: pool.pool.vault,
        })
      } else {
        // FIXME the borrow instruction automatically creates the ATA if it doesn't exist
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

        signature = await borrow.mutateAsync({
          amount: rawAmount,
          authority: toPk(marketAuthority),
          market,
          mint: pool.pool.mint,
          owner: umi.identity,
          ownerTokenAta: ownerAta,
          pool: pool.pool.publicKey,
          poolVault: pool.pool.vault,
          remainingPools,
        })
      }

      const signatureBase58 = base58.deserialize(signature)[0]
      notify({
        label: mode === "deposit" ? "Deposit" : "Borrow",
        signature: signatureBase58,
      })

      onOpenChange(false)
      resetInputs()

      setTimeout(() => {
        void onSuccess()
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
              <SelectTrigger className="w-full">
                <SelectValue placeholder={availableList.length ? "Asset" : "No available assets"} />
              </SelectTrigger>
              <SelectContent>
                {availableList.map(({ asset }) => (
                  <SelectItem key={asset.symbol} value={asset.symbol}>
                    {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-muted-foreground mt-1 text-xs">
              {mode === "deposit" ? (
                <>
                  Available: {available.toFixed(4)} {asset?.symbol} ·{" "}
                  {formatCurrency(available * price, 2)}
                </>
              ) : (
                <>
                  Pool liquidity: {available.toFixed(4)} {asset?.symbol} ·{" "}
                  {formatCurrency(available * price, 2)}
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground mb-1">{asset?.symbol ?? "Amount"}</div>
              <Input
                className="no-spinner text-right font-medium"
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
                className="no-spinner text-right font-medium"
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
            <div className="text-muted-foreground text-xs">
              {mode === "deposit" ? "Use wallet balance" : "Health-based borrowing"}
            </div>
            <div className="flex gap-2">
              {mode === "deposit" ? (
                <>
                  <Button
                    disabled={!asset}
                    onClick={() => setPercentage(1)}
                    size="sm"
                    variant="secondary"
                  >
                    Max
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    disabled={!asset || !deposits.length}
                    onClick={setSafeBorrow}
                    size="sm"
                    title="Borrow amount for health score = 1.5"
                    variant="secondary"
                  >
                    Safe
                  </Button>
                  <Button
                    disabled={!asset || !deposits.length}
                    onClick={setMaxBorrow}
                    size="sm"
                    title="Borrow amount for health score = 1.0 (liquidation threshold)"
                    variant="secondary"
                  >
                    Max
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="border-muted-foreground/30 bg-background/40 rounded-xs border-2 border-dashed p-3">
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
            <Button onClick={() => onOpenChange(false)} variant="secondary">
              Cancel
            </Button>
            <Button
              data-tour={mode === "deposit" ? "confirm-deposit" : "confirm-borrow"}
              disabled={!!disabledReason || submitting}
              onClick={submit}
            >
              {submitting
                ? mode === "deposit"
                  ? "Depositing…"
                  : "Borrowing…"
                : mode === "deposit"
                  ? "Deposit"
                  : "Borrow"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
