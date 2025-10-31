"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import type { DiscoverAsset } from "@/hooks/useDiscoverAssets"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/utils"

export type HedgePlan = {
  baseDepositUsd: number
  longs: HedgeLeg[]
  mode: "existing" | "new"
  shorts: HedgeLeg[]
}

interface HedgeDialogProps {
  error: null | string
  isExecuting: boolean
  onClose: () => void
  onSubmit: (plan: HedgePlan) => Promise<void>
  open: boolean
  plan: HedgePlan | null
}

type HedgeLeg = {
  amount: number
  asset: DiscoverAsset
}

export function HedgeDialog({
  error,
  isExecuting,
  onClose,
  onSubmit,
  open,
  plan,
}: HedgeDialogProps) {
  const [localPlan, setLocalPlan] = useState<HedgePlan | null>(plan)

  useEffect(() => {
    if (plan) {
      setLocalPlan(plan)
    }
  }, [plan])

  const limits = useMemo(() => {
    if (!plan) {
      return {
        longs: new Map<string, number>(),
        shorts: new Map<string, number>(),
      }
    }
    return {
      longs: new Map(plan.longs.map((leg) => [leg.asset.pool.mint.toString(), leg.amount])),
      shorts: new Map(plan.shorts.map((leg) => [leg.asset.pool.mint.toString(), leg.amount])),
    }
  }, [plan])

  const totals = useMemo(() => {
    if (!localPlan) {
      return { longUsd: 0, shortUsd: 0 }
    }
    const longUsd = localPlan.longs.reduce((acc, leg) => acc + toUsd(leg), 0)
    const shortUsd = localPlan.shorts.reduce((acc, leg) => acc + toUsd(leg), 0)
    return { longUsd, shortUsd }
  }, [localPlan])

  const canSubmit =
    Boolean(localPlan) &&
    localPlan!.longs.some((leg) => leg.amount > 0) &&
    localPlan!.shorts.some((leg) => leg.amount > 0)

  if (!localPlan) {
    return null
  }

  const handleAmountChange = (type: "longs" | "shorts", index: number, value: string) => {
    const amount = Number.parseFloat(value)
    if (Number.isNaN(amount) || amount < 0) return
    setLocalPlan((prev) => {
      if (!prev) return prev
      const targetLeg = prev[type][index]
      if (!targetLeg) return prev
      const key = targetLeg.asset.pool.mint.toString()
      const typeLimits = type === "longs" ? limits.longs : limits.shorts
      const maxAllowed = typeLimits.get(key) ?? Number.POSITIVE_INFINITY
      const clamped = Math.min(Math.max(amount, 0), maxAllowed)
      const nextLegs = prev[type].map((leg, idx) =>
        idx === index ? { ...leg, amount: clamped } : leg,
      )
      return {
        ...prev,
        [type]: nextLegs,
      }
    })
  }

  return (
    <Dialog onOpenChange={onClose} open={open}>
      <DialogContent className="border-foreground bg-background/95 text-foreground rounded-xs border-2 shadow-xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Configure Hedge</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Adjust the default amounts below before executing your hedge strategy.
          </p>
        </DialogHeader>

        <div className="space-y-6">
          {localPlan.mode === "new" ? (
            <div className="border-muted/60 bg-background/40 rounded-xs border-2 p-3 text-sm">
              <p className="text-muted-foreground">
                This wallet has no existing position. We will mint and deposit{" "}
                <span className="font-semibold">
                  {formatCurrency(localPlan.baseDepositUsd, 2)} USDC
                </span>{" "}
                as collateral before opening the hedge.
              </p>
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2">
            <div className="border-foreground bg-card/80 rounded-xs border-2 p-4">
              <header className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-green-500 uppercase">
                    Long Positions
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Tokens to hold after swaps and deposits.
                  </p>
                </div>
                <div className="text-foreground text-sm font-semibold">
                  {formatCurrency(totals.longUsd, 2)}
                </div>
              </header>

              <div className="space-y-3">
                {localPlan.longs.map((leg, index) => {
                  const price = leg.asset.price ?? 0
                  const key = leg.asset.pool.mint.toString()
                  const maxAmount = limits.longs.get(key) ?? 0
                  const maxUsd = maxAmount * (price ?? 0)
                  return (
                    <div
                      className="border-border/50 bg-background/60 rounded-xs border px-3 py-2"
                      key={leg.asset.pool.mint.toString()}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{leg.asset.assetName}</p>
                          <p className="text-muted-foreground text-xs">{leg.asset.assetSymbol}</p>
                        </div>
                        <div className="text-muted-foreground text-xs">
                          Price: {formatCurrency(price ?? 0, 2)}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Input
                          className="no-spinner w-32 text-right"
                          inputMode="decimal"
                          max={maxAmount}
                          min={0}
                          onChange={(event) =>
                            handleAmountChange("longs", index, event.target.value)
                          }
                          step="any"
                          type="number"
                          value={leg.amount}
                        />
                        <div className="text-muted-foreground text-xs">
                          ≈ {formatCurrency(leg.amount * (price ?? 0), 2)}
                        </div>
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        Max {maxAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                        {leg.asset.assetSymbol} ({formatCurrency(maxUsd, 2)})
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="border-foreground bg-card/80 rounded-xs border-2 p-4">
              <header className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold tracking-wide text-orange-500 uppercase">
                    Short Positions
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Borrowed tokens that will be swapped away.
                  </p>
                </div>
                <div className="text-foreground text-sm font-semibold">
                  {formatCurrency(totals.shortUsd, 2)}
                </div>
              </header>

              <div className="space-y-3">
                {localPlan.shorts.map((leg, index) => {
                  const price = leg.asset.price ?? 0
                  const icon =
                    price >= 0 ? (
                      <TrendingUp className="size-4 text-green-500" />
                    ) : (
                      <TrendingDown className="size-4 text-red-500" />
                    )
                  const key = leg.asset.pool.mint.toString()
                  const maxAmount = limits.shorts.get(key) ?? 0
                  const maxUsd = maxAmount * (price ?? 0)
                  const poolLiquidity = Math.max(
                    0,
                    leg.asset.totalDeposits - leg.asset.totalBorrows,
                  )
                  return (
                    <div
                      className="border-border/50 bg-background/60 rounded-xs border px-3 py-2"
                      key={leg.asset.pool.mint.toString()}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {icon}
                          <div>
                            <p className="text-sm font-medium">{leg.asset.assetName}</p>
                            <p className="text-muted-foreground text-xs">{leg.asset.assetSymbol}</p>
                          </div>
                        </div>
                        <div className="text-muted-foreground text-xs">
                          Price: {formatCurrency(price ?? 0, 2)}
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <Input
                          className="no-spinner w-32 text-right"
                          inputMode="decimal"
                          max={maxAmount}
                          min={0}
                          onChange={(event) =>
                            handleAmountChange("shorts", index, event.target.value)
                          }
                          step="any"
                          type="number"
                          value={leg.amount}
                        />
                        <div className="text-muted-foreground text-xs">
                          ≈ {formatCurrency(leg.amount * (price ?? 0), 2)}
                        </div>
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        <p>
                          Max {maxAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{" "}
                          {leg.asset.assetSymbol} ({formatCurrency(maxUsd, 2)})
                        </p>
                        <p>
                          Pool liquidity:{" "}
                          {poolLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                          {leg.asset.assetSymbol}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          {error ? (
            <div className="border-destructive/60 bg-destructive/10 text-destructive rounded-xs border-2 px-3 py-2 text-sm">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-muted-foreground text-xs">
            Review the amounts carefully. A target health score of 1.5 is applied when estimating
            safe borrows.
          </div>
          <div className="flex gap-2">
            <Button disabled={isExecuting} onClick={onClose} type="button" variant="secondary">
              Cancel
            </Button>
            <Button
              disabled={!canSubmit || isExecuting}
              onClick={() => localPlan && onSubmit(localPlan)}
            >
              {isExecuting ? "Executing…" : "Confirm Hedge"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const toUsd = (leg: HedgeLeg) => (leg.asset.price ?? 0) * leg.amount
