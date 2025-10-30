/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { motion } from "framer-motion"
import { ArrowLeft } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useMemo } from "react"

import MetricsRow from "@/components/MetricsRow"
import DataTable, { Column } from "@/components/tables/DataTable"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  useAssetRegistryByMarket,
  useBestMarket,
  useObligationByPda,
  usePoolsByMarket,
  usePriceCacheByMarket,
} from "@/hooks/umi/queries"
import { getHealthScoreWithLt } from "@/lib/portfolio"
import { getAssetByMint } from "@/lib/riskParameterQuery"
import { calculateUserBorrowAmount, calculateUserDepositAmount } from "@/lib/umi/obligation-utils"
import { getAssetMetaByMint, getPriceForAsset } from "@/lib/umi/pool-utils"
import { formatCurrency } from "@/lib/utils"
import { Position } from "@/types/portfolio"

export default function UserPortfolioPage() {
  const params = useParams()
  const router = useRouter()
  const account = decodeURIComponent(params.account as string)

  // Auto-fetch market and registry (same as portfolio page)
  const { data: marketData } = useBestMarket()
  const selectedMarket = marketData?.publicKey?.toString() ?? undefined

  // Fetch asset registry from market
  const { data: registry, isLoading: registryLoading } = useAssetRegistryByMarket(selectedMarket, {
    enabled: !!selectedMarket,
  })

  // Fetch pools for the market
  const { data: pools, isLoading: poolsLoading } = usePoolsByMarket(selectedMarket, {
    enabled: !!selectedMarket,
  })

  // Fetch price cache
  const { data: priceCache } = usePriceCacheByMarket(selectedMarket, {
    enabled: !!selectedMarket,
  })

  // NEW: Fetch obligation by PDA (not owner)
  const { data: obligation, isLoading: obligationLoading } = useObligationByPda(account, {
    enabled: !!account && !!selectedMarket,
  })

  // Build assets array with prices (same as portfolio page)
  const assets = useMemo(() => {
    if (!registry) return []

    // Lazy import for asset lookup

    return registry.assets.map((a: any) => {
      const mintStr = a.mint.toString()
      const assetInfo = getAssetByMint(mintStr)

      const name = assetInfo?.name ?? `${mintStr.slice(0, 8)}...`
      const symbol = assetInfo?.symbol ?? mintStr.slice(0, 8)

      return {
        cmc_id: a.index,
        decimals: a.decimals,
        index: a.index,
        mint: mintStr,
        name,
        price: {
          latest: getPriceForAsset(priceCache ?? null, a.index) ?? 0,
          marketcap: 0,
          percentChange1h: 0,
          percentChange7d: 0,
          percentChange24h: 0,
          volume24h: 0,
        },
        symbol,
      }
    })
  }, [registry, priceCache])

  // Convert obligation shares to actual amounts using pool factors (same as portfolio page)
  const obligations = useMemo(() => {
    if (!obligation || !registry || !pools) return { borrows: [], deposits: [] }

    const deposits: any[] = []
    const borrows: any[] = []

    obligation.positions.forEach((pos: any) => {
      const mintStr = pos.mint.toString()
      const assetMeta = getAssetMetaByMint(registry, pos.mint)
      const pool = pools.find((p: any) => p.mint.toString() === mintStr)

      if (!assetMeta || !pool) return

      const depositShares = BigInt(pos.depositSharesQ60)
      const borrowShares = BigInt(pos.borrowSharesQ60)

      // Convert shares to actual amounts using pool deposit/borrow factors
      if (depositShares > BigInt(0)) {
        deposits.push({
          amount_ui: calculateUserDepositAmount(depositShares, pool, assetMeta.decimals),
          asset_id: assetMeta.index,
          mint: mintStr,
        })
      }

      if (borrowShares > BigInt(0)) {
        borrows.push({
          amount_ui: calculateUserBorrowAmount(borrowShares, pool, assetMeta.decimals),
          asset_id: assetMeta.index,
          mint: mintStr,
        })
      }
    })

    return { borrows, deposits }
  }, [obligation, registry, pools])

  const priceOf = useCallback(
    (id: number) => assets?.find((a) => a.cmc_id === id)?.price.latest ?? 0,
    [assets],
  )

  // Calculate portfolio metrics
  const dollarWorth = 0 // Not fetching wallet balances for other users

  const depositWorth = useMemo(
    () =>
      obligations?.deposits.reduce((s, d) => s + (d.amount_ui ?? 0) * priceOf(d.asset_id), 0) ?? 0,
    [obligations, priceOf],
  )

  const borrowWorth = useMemo(
    () =>
      obligations?.borrows.reduce((s, b) => s + (b.amount_ui ?? 0) * priceOf(b.asset_id), 0) ?? 0,
    [obligations, priceOf],
  )

  const wrapped = useMemo(() => {
    if (!obligations || !assets) return { borrows: [], deposits: [] }
    const wrap = (arr: typeof obligations.deposits) =>
      arr
        .map((x) => {
          const asset = assets.find((a) => a.cmc_id === x.asset_id)
          return asset ? { amount: x.amount_ui, asset } : null
        })
        .filter(Boolean) as Position[]
    return {
      borrows: wrap(obligations.borrows),
      deposits: wrap(obligations.deposits),
    }
  }, [obligations, assets])

  const healthScore = useMemo(() => {
    const ltProvider = () => 0.9 // Using default LT for view-only
    const score = getHealthScoreWithLt(wrapped.deposits, wrapped.borrows, ltProvider)
    return isNaN(score) ? 0 : score
  }, [wrapped])

  const projectedApy = 0 // Simplified for view-only mode

  const isLoading = registryLoading || poolsLoading || obligationLoading

  return (
    <div className="flex h-full w-full flex-col gap-2 pb-20">
      <div className="mb-4 flex items-center gap-4">
        <Button onClick={() => router.back()} size="sm" variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="font-mono text-lg font-semibold">Portfolio View</h1>
          <p className="text-muted-foreground font-mono text-sm">{account}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center">Loading portfolio data...</div>
      ) : !obligation ? (
        <div className="text-muted-foreground py-8 text-center">
          No obligation found for this account
        </div>
      ) : (
        <>
          <MetricsRow
            borrowWorth={borrowWorth}
            depositWorth={depositWorth}
            dollarWorth={dollarWorth}
            healthScore={healthScore}
            projectedApy={projectedApy}
          />

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2"
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <PositionsCard positions={wrapped.deposits} title="Deposits" />
            <PositionsCard positions={wrapped.borrows} title="Borrows" />
          </motion.div>
        </>
      )}
    </div>
  )
}

function PositionsCard({ positions, title }: { positions: Position[]; title: string }) {
  const cols: Column<Position>[] = [
    { accessor: (r) => r.asset.name, className: "font-medium", header: "Asset" },
    { accessor: (r) => r.asset.symbol, header: "Symbol" },
    { accessor: (r) => r.amount.toFixed(4), header: "Amount" },
    {
      accessor: (r) => formatCurrency(r.amount * r.asset.price.latest, 2),
      className: "hidden sm:table-cell",
      header: "Value",
    },
  ]

  return (
    <Card className="border-border bg-card shadow">
      <CardHeader className="pb-3">
        <CardTitle className="font-semibold tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {positions.length ? (
          <DataTable columns={cols} data={positions} keyFn={(r) => r.asset.symbol} />
        ) : (
          <div className="text-muted-foreground py-4 text-center">
            No {title.toLowerCase()} yet.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
