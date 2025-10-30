"use client"

import { BanknoteArrowDown, BanknoteArrowUp, TrendingUpDown } from "lucide-react"
import { useMemo, useState } from "react"

import type { EnrichedPool } from "@/lib/umi/pool-utils"

import TokenActionDialog from "@/components/dialogs/TokenActionDialog"
import WithdrawRepayDialog from "@/components/dialogs/WithdrawRepayDialog"
import DataTable, { Column } from "@/components/tables/DataTable"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { calculateCurrentApys } from "@/lib/umi/rate-calculations"
import { formatCurrency } from "@/lib/utils"
import { Asset } from "@/types/asset"
import { Position } from "@/types/portfolio"

export type PositionsMode = "leverage" | "portfolio"

type ObligationData = {
  borrows: { amount_ui: number; asset_id: number }[]
  deposits: { amount_ui: number; asset_id: number }[]
}

type WalletBalance = {
  amount_ui: number
  asset_id: number
}

export default function PositionsTable({
  assets,
  enrichedPools = [],
  marketAuthority,
  mode = "portfolio",
  obligations,
  onLeverageClick,
  onSuccess,
  selectedMarket,
  side,
  title,
  walletBalances = [],
  wrapped,
}: {
  assets: Asset[] | undefined
  enrichedPools?: EnrichedPool[]
  marketAuthority?: null | string
  mode?: PositionsMode
  obligations?: ObligationData
  onLeverageClick?: (pos: Position) => void
  onSuccess?: () => void
  selectedMarket?: null | string
  side: "borrows" | "deposits"
  title: string
  walletBalances?: WalletBalance[]
  wrapped: Position[]
}) {
  const [dlg, setDlg] = useState<null | {
    kind: "repay" | "withdraw"
    open: boolean
    pos: Position
  }>(null)

  type Row = Position
  const rows = wrapped

  const [actionDlg, setActionDlg] = useState<null | { mode: "borrow" | "deposit"; open: boolean }>(
    null,
  )

  const apyMap = useMemo(() => {
    const byIndex = new Map<number, { borrow: number; deposit: number }>()
    const byMint = new Map<string, { borrow: number; deposit: number }>()

    enrichedPools?.forEach((pool) => {
      const utilizationBps = Math.round(pool.utilizationRate * 100)
      const apys = calculateCurrentApys(pool.pool.rate, utilizationBps)
      const entry = { borrow: apys.borrowApyPercent, deposit: apys.depositApyPercent }

      const index = pool.assetMeta?.index
      if (index != null) byIndex.set(index, entry)

      byMint.set(pool.pool.mint.toString(), entry)
    })

    return { byIndex, byMint }
  }, [enrichedPools])

  const cols: Column<Row>[] = [
    {
      accessor: (r) => r.asset.name,
      className: "font-medium",
      header: "Asset",
    },
    {
      accessor: (r) => r.amount.toFixed(2),
      header: "Amount",
    },
    {
      accessor: (r) => {
        const entry =
          apyMap.byIndex.get(r.asset.cmc_id) ??
          (r.asset.mint ? apyMap.byMint.get(r.asset.mint) : undefined)
        if (!entry) return "—"
        const value = side === "deposits" ? entry.deposit : entry.borrow
        return `${value.toFixed(2)}%`
      },
      className: "",
      header: side === "deposits" ? "Supply APY" : "Borrow APY",
    },
    {
      accessor: (r) => formatCurrency(r.amount * r.asset.price.latest, 2),
      className: "hidden sm:table-cell",
      header: "Value",
    },
    {
      accessor: (r) =>
        mode === "leverage" && side === "deposits" ? (
          <Button
            className="text-foreground h-8 w-8 p-0 hover:cursor-pointer"
            data-tour="lev-action"
            onClick={() => onLeverageClick?.(r)}
            title="Leverage this deposit"
            variant="outline"
          >
            <TrendingUpDown />
          </Button>
        ) : side === "deposits" ? (
          <Button
            className="text-foreground h-8 w-8 p-0 hover:cursor-pointer"
            onClick={() => setDlg({ kind: "withdraw", open: true, pos: r })}
            variant="outline"
          >
            <BanknoteArrowUp />
          </Button>
        ) : (
          <Button
            className="text-foreground h-8 w-8 p-0 hover:cursor-pointer"
            onClick={() => setDlg({ kind: "repay", open: true, pos: r })}
            variant="outline"
          >
            <BanknoteArrowDown />
          </Button>
        ),
      className: "w-10 pl-1",
      header: "",
    },
  ]

  return (
    <Card className="bg-card border-foreground rounded-xs border-2 shadow-xl">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="font-semibold tracking-tight">{title}</CardTitle>

        {assets && (
          <Button
            className="ring-primary ring-1"
            data-tour={side === "deposits" ? "deposit-add" : "borrow-add"}
            onClick={() =>
              setActionDlg({ mode: side === "deposits" ? "deposit" : "borrow", open: true })
            }
            variant="default"
          >
            {side === "deposits" ? "New Deposit" : "New Borrow"}
          </Button>
        )}
      </CardHeader>

      <CardContent className="overflow-x-auto">
        <DataTable columns={cols} data={rows} keyFn={(_, i) => i} />
      </CardContent>

      {actionDlg && obligations && selectedMarket && marketAuthority && (
        <TokenActionDialog
          allAssets={assets ?? []}
          enrichedPools={enrichedPools}
          marketAuthority={marketAuthority}
          mode={actionDlg.mode}
          obligations={obligations}
          onOpenChange={(o) => setActionDlg(o ? actionDlg : null)}
          onSuccess={onSuccess ?? (() => {})}
          open={actionDlg.open}
          selectedMarket={selectedMarket}
          walletBalances={walletBalances}
        />
      )}

      {dlg && dlg.open && selectedMarket && marketAuthority && obligations && (
        <WithdrawRepayDialog
          allAssets={assets ?? []}
          defaultAsset={dlg.pos.asset}
          enrichedPools={enrichedPools}
          marketAuthority={marketAuthority}
          mode={dlg.kind}
          obligations={obligations}
          onOpenChange={(o) => (o ? null : setDlg(null))}
          onSuccess={onSuccess ?? (() => {})}
          open={dlg.open}
          selectedMarket={selectedMarket}
        />
      )}
    </Card>
  )
}
