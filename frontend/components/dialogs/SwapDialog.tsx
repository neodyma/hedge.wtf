"use client"

import { publicKey as toPk } from "@metaplex-foundation/umi"
import { bytes, publicKey as publicKeySerializer } from "@metaplex-foundation/umi/serializers"
import { base58 } from "@metaplex-foundation/umi/serializers"
import { useEffect, useMemo, useState } from "react"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { PriceCache } from "@/clients/generated/accounts/priceCache"
import type { EnrichedPool } from "@/lib/umi/pool-utils"
import type { Asset } from "@/types/asset"

import { safeFetchFaucetMint } from "@/clients/generated/accounts/faucetMint"
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
import { useFaucetSwap } from "@/hooks/umi/mutations"
import { useTokenAmountInputs } from "@/hooks/umi/useTokenAmountInputs"
import { useSolanaWallet } from "@/hooks/useSolanaWallet"
import { deriveAta, uiToRawU64 } from "@/lib/umi/pda-utils"
import { getPriceForAsset } from "@/lib/umi/pool-utils"
import { formatCurrency } from "@/lib/utils"
import { useProgramId, useUmi } from "@/providers/UmiContext"

type WalletBalance = {
  amount_ui: number
  asset_id: number
}

export default function SwapDialog({
  allAssets,
  defaultAsset,
  enrichedPools,
  onOpenChange,
  onSuccess,
  open,
  priceCache,
  registry,
  selectedMarket,
  walletBalances,
}: {
  allAssets: Asset[]
  defaultAsset?: Asset | null
  enrichedPools: EnrichedPool[]
  onOpenChange: (o: boolean) => void
  onSuccess: () => void
  open: boolean
  priceCache: null | PriceCache
  registry: AssetRegistry | null
  selectedMarket: null | string
  walletBalances: WalletBalance[]
}) {
  const umi = useUmi()
  const pid = useProgramId()
  const { address: walletPublicKey } = useSolanaWallet()
  const swapM = useFaucetSwap()
  const notify = useTxOverlay()

  // Get available assets (those with wallet balances)
  const availableList = useMemo(() => {
    return walletBalances
      .map((wb) => {
        const asset = allAssets.find((a) => a.cmc_id === wb.asset_id)
        if (!asset || wb.amount_ui <= 0) return null
        return { asset, available: wb.amount_ui }
      })
      .filter((x): x is { asset: Asset; available: number } => x !== null)
  }, [walletBalances, allAssets])

  const [fromSymbol, setFromSymbol] = useState<string>(
    defaultAsset?.symbol ?? allAssets[0]?.symbol ?? "",
  )

  useEffect(() => {
    if (!open) return
    if (!availableList.length) return
    const inList = availableList.some((x) => x.asset.symbol === fromSymbol)
    if (!inList) {
      const fallback =
        (defaultAsset &&
          availableList.find((x) => x.asset.symbol === defaultAsset.symbol)?.asset.symbol) ??
        availableList[0].asset.symbol
      setFromSymbol(fallback)
    }
  }, [open, availableList, defaultAsset, fromSymbol])

  const fromEntry = useMemo(
    () => availableList.find((x) => x.asset.symbol === fromSymbol) ?? null,
    [availableList, fromSymbol],
  )
  const fromAsset = fromEntry?.asset ?? null
  const fromPrice = fromAsset?.price.latest ?? 0
  const fromAvailable = fromEntry?.available ?? 0

  const toAssetList = useMemo(() => {
    return allAssets.filter((a) => a.cmc_id !== fromAsset?.cmc_id)
  }, [allAssets, fromAsset])

  const [toSymbol, setToSymbol] = useState<string>("")

  useEffect(() => {
    if (!open) return
    if (!toAssetList.length) return
    const inList = toAssetList.some((a) => a.symbol === toSymbol)
    if (!inList) {
      setToSymbol(toAssetList[0]?.symbol ?? "")
    }
  }, [open, toAssetList, toSymbol])

  const toAsset = useMemo(
    () => toAssetList.find((a) => a.symbol === toSymbol) ?? null,
    [toAssetList, toSymbol],
  )
  const toPrice = toAsset?.price.latest ?? 0

  const fromInputs = useTokenAmountInputs({
    autoSelectMax: true,
    isDialogOpen: open,
    maxAmount: fromAvailable,
    price: fromPrice,
    resetDeps: [fromSymbol],
  })

  const {
    reset: resetFromInputs,
    setPercentage: setFromPercentage,
    setTokenInput: setFromTokenInput,
    setUsdInput: setFromUsdInput,
    tokenAmount: fromTokenAmount,
    tokenInput: fromTokenInput,
    usdAmount: fromUsdAmount,
    usdInput: fromUsdInput,
  } = fromInputs

  // Calculate output amount using on-chain prices
  const toTokenAmount = useMemo(() => {
    if (!toAsset || !fromTokenAmount || !priceCache || !registry) return 0

    const fromPriceOnChain = getPriceForAsset(
      priceCache,
      fromAsset?.index ?? fromAsset?.cmc_id ?? 0,
    )
    const toPriceOnChain = getPriceForAsset(priceCache, toAsset.index ?? toAsset.cmc_id)

    if (!fromPriceOnChain || !toPriceOnChain) return 0

    const inVal = fromTokenAmount * fromPriceOnChain
    const outVal = inVal / toPriceOnChain
    return outVal
  }, [toAsset, fromTokenAmount, fromAsset, priceCache, registry])

  const toUsdAmount = toTokenAmount * toPrice

  const disabledReason = !fromAsset
    ? availableList.length === 0
      ? "No wallet balances available to swap"
      : "Select source asset"
    : !toAsset
      ? "Select target asset"
      : fromTokenAmount <= 0
        ? "Enter an amount"
        : fromTokenAmount > fromAvailable
          ? "Insufficient wallet balance"
          : null

  const [submitting, setSubmitting] = useState(false)
  const submit = async () => {
    if (!fromAsset || !toAsset || disabledReason || !walletPublicKey || !selectedMarket) {
      console.error("Missing required data for swap:", {
        disabledReason,
        fromAsset: !!fromAsset,
        selectedMarket: !!selectedMarket,
        toAsset: !!toAsset,
        walletPublicKey: !!walletPublicKey,
      })
      return
    }

    setSubmitting(true)
    try {
      // Find pools for both assets
      const fromPool = enrichedPools.find(
        (p) =>
          p.pool.mint.toString() === fromAsset.mint ||
          p.assetMeta?.index === fromAsset.index ||
          p.assetMeta?.index === fromAsset.cmc_id,
      )
      const toPool = enrichedPools.find(
        (p) =>
          p.pool.mint.toString() === toAsset.mint ||
          p.assetMeta?.index === toAsset.index ||
          p.assetMeta?.index === toAsset.cmc_id,
      )

      if (!fromPool || !toPool) {
        throw new Error(`Pool not found for ${!fromPool ? fromAsset.symbol : toAsset.symbol}`)
      }

      const rawAmount = uiToRawU64(fromTokenAmount.toString(), fromAsset.decimals)
      if (!rawAmount) {
        throw new Error(`Invalid amount conversion for ${fromTokenAmount}`)
      }

      const owner = toPk(walletPublicKey.toString())
      const market = toPk(selectedMarket)
      const programId = toPk(pid)

      const SEED_FAUCET_MINT = new Uint8Array([102, 97, 117, 99, 101, 116, 45, 109, 105, 110, 116])

      const [faucetMintFrom] = umi.eddsa.findPda(programId, [
        bytes().serialize(SEED_FAUCET_MINT),
        publicKeySerializer().serialize(market),
        publicKeySerializer().serialize(fromPool.pool.mint),
      ])

      const [faucetMintTo] = umi.eddsa.findPda(programId, [
        bytes().serialize(SEED_FAUCET_MINT),
        publicKeySerializer().serialize(market),
        publicKeySerializer().serialize(toPool.pool.mint),
      ])

      const [faucetMintFromAcc, faucetMintToAcc] = await Promise.all([
        safeFetchFaucetMint(umi, faucetMintFrom),
        safeFetchFaucetMint(umi, faucetMintTo),
      ])

      if (!faucetMintFromAcc) {
        throw new Error(
          `FaucetMint for source asset (${fromAsset.symbol}) not initialized. Please contact admin.`,
        )
      }

      if (!faucetMintToAcc) {
        throw new Error(
          `FaucetMint for target asset (${toAsset.symbol}) not initialized. Please contact admin.`,
        )
      }

      const fromAta = deriveAta(umi, owner, fromPool.pool.mint)

      if (!registry || !priceCache) {
        throw new Error("Registry or PriceCache not available")
      }

      // Execute swap
      const signature = await swapM.mutateAsync({
        amount: rawAmount,
        assetRegistry: registry.publicKey,
        faucetMintFrom,
        faucetMintTo,
        mintFrom: fromPool.pool.mint,
        mintTo: toPool.pool.mint,
        priceCache: priceCache.publicKey,
        user: umi.identity,
        userTokenFrom: fromAta,
      })

      const signatureBase58 = base58.deserialize(signature)[0]
      notify({
        label: "Swap",
        signature: signatureBase58,
      })

      onOpenChange(false)
      resetFromInputs()

      setTimeout(() => {
        void onSuccess()
      }, 10000)
    } catch (error) {
      console.error("Swap error:", error)
      alert(`Error: ${error}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="border-foreground bg-popover text-popover-foreground rounded-sm border-2 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Swap</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <div className="text-muted-foreground mb-1">From</div>
            <Select
              disabled={!availableList.length}
              onValueChange={setFromSymbol}
              value={fromSymbol}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  placeholder={availableList.length ? "Select source" : "No available assets"}
                />
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
              Available: {fromAvailable.toFixed(4)} {fromAsset?.symbol} ·{" "}
              {formatCurrency(fromAvailable * fromPrice, 2)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-muted-foreground mb-1">{fromAsset?.symbol ?? "Amount"}</div>
              <Input
                className="no-spinner text-right font-medium"
                disabled={!fromAsset}
                inputMode="decimal"
                onBlur={() => setFromTokenInput(fromTokenAmount ? fromTokenAmount.toString() : "")}
                onChange={(e) => {
                  const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, "")
                  setFromTokenInput(cleaned)
                }}
                placeholder="0.00"
                type="text"
                value={fromTokenInput}
              />
              <div className="text-muted-foreground/80 mt-1 text-xs">
                ≈ {formatCurrency(fromTokenAmount * fromPrice, 2)}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground mb-1">USD</div>
              <Input
                className="no-spinner text-right font-medium"
                disabled={!fromAsset}
                inputMode="decimal"
                onBlur={() => setFromUsdInput(fromUsdAmount ? fromUsdAmount.toString() : "")}
                onChange={(e) => {
                  const cleaned = e.currentTarget.value.replace(/[^\d.,]/g, "")
                  setFromUsdInput(cleaned)
                }}
                placeholder={formatCurrency(fromTokenAmount * fromPrice, 2)}
                type="text"
                value={fromUsdInput}
              />
              <div className="text-muted-foreground/80 mt-1 text-xs">
                ≈ {(fromPrice > 0 ? fromUsdAmount / fromPrice : 0).toFixed(6)} {fromAsset?.symbol}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-xs">Use wallet balance</div>
            <div className="flex gap-2">
              <Button
                disabled={!fromAsset}
                onClick={() => setFromPercentage(1)}
                size="sm"
                variant="secondary"
              >
                Max
              </Button>
            </div>
          </div>

          <div>
            <div className="text-muted-foreground mb-1">To</div>
            <Select disabled={!toAssetList.length} onValueChange={setToSymbol} value={toSymbol}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={toAssetList.length ? "Select target" : "No assets"} />
              </SelectTrigger>
              <SelectContent>
                {toAssetList.map((asset) => (
                  <SelectItem key={asset.symbol} value={asset.symbol}>
                    {asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-muted-foreground mt-1 text-xs">
              You will receive: {toTokenAmount.toFixed(6)} {toAsset?.symbol} ·{" "}
              {formatCurrency(toUsdAmount, 2)}
            </div>
          </div>

          <div className="border-muted-foreground/30 bg-background/40 rounded-xs border-2 border-dashed p-3">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">You will swap</span>
              <span className="font-medium">
                {fromTokenAmount.toFixed(6)} {fromAsset?.symbol} (
                {formatCurrency(fromTokenAmount * fromPrice, 2)})
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground">For approximately</span>
              <span className="font-medium">
                {toTokenAmount.toFixed(6)} {toAsset?.symbol} ({formatCurrency(toUsdAmount, 2)})
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
            <Button disabled={!!disabledReason || submitting} onClick={submit}>
              {submitting ? "Swapping…" : "Swap"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
