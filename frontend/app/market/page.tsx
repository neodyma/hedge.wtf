"use client"

import { motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { useMemo } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  useAutoMarketAndRegistry,
  usePoolsByMarket,
  usePriceCacheByMarket,
} from "@/hooks/umi/queries"
import { useSolanaWallet } from "@/hooks/useSolanaWallet"
import { getAssetByMint } from "@/lib/riskParameterQuery"
import { type EnrichedPool, enrichPools, formatMintAddress } from "@/lib/umi/pool-utils"
import { calculateCurrentApys } from "@/lib/umi/rate-calculations"
import { cn, formatCurrency } from "@/lib/utils"

export default function MarketPage() {
  const router = useRouter()
  const { address: publicKey } = useSolanaWallet()

  const { data: marketData, isLoading: marketLoading } = useAutoMarketAndRegistry()
  const market = marketData?.market
  const registry = marketData?.registry

  const { data: pools = [], isLoading: poolsLoading } = usePoolsByMarket(market?.publicKey)
  const { data: priceCache, isLoading: pricesLoading } = usePriceCacheByMarket(market?.publicKey)

  const enrichedPools = useMemo(
    () => enrichPools(pools, registry ?? null, priceCache ?? null),
    [pools, registry, priceCache],
  )

  const poolsWithAssetData = useMemo(() => {
    return enrichedPools.map((pool) => {
      const assetData = getAssetByMint(pool.pool.mint.toString())
      return {
        ...pool,
        assetData,
      }
    })
  }, [enrichedPools])

  const isLoading = marketLoading || poolsLoading || pricesLoading

  const handleRowClick = (pool: EnrichedPool) => {
    router.push(`/market/${pool.pool.mint.toString()}`)
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card className="border-border bg-card scrollbar-hide shadow md:m-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-semibold tracking-tight">
            Market Overview (Devnet)
            {/* {market && (
              // <span className="text-muted-foreground ml-2 text-sm font-normal">
              //   ({formatMintAddress(market.publicKey, 4)})
              // </span>
            // )} */}
          </CardTitle>
          {/* {publicKey && (
            <Badge variant="outline" className="font-mono text-xs">
              {publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-4)}
            </Badge>
          )} */}
        </CardHeader>

        <CardContent className="overflow-x-auto">
          {isLoading ? (
            <div className="py-8 text-center">
              <div className="text-muted-foreground">Loading market data from devnet...</div>
            </div>
          ) : poolsWithAssetData.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              No pools found for this market.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-2">Asset</th>
                  <th className="py-2">Symbol</th>
                  <th className="py-2">Mint</th>
                  <th className="py-2">Price (USD)</th>
                  <th className="py-2">Total Deposits</th>
                  <th className="py-2">Deposit APY</th>
                  <th className="py-2">Total Borrows</th>
                  <th className="py-2">Borrow APY</th>
                  <th className="py-2">Utilization</th>
                </tr>
              </thead>
              <tbody className="text-foreground">
                {poolsWithAssetData.map((pool) => {
                  const utilizationBps = Math.round(pool.utilizationRate * 100)
                  const apys = calculateCurrentApys(pool.pool.rate, utilizationBps)

                  return (
                    <tr
                      className="border-border hover:bg-accent/50 cursor-pointer border-t transition-colors"
                      key={pool.pool.mint.toString()}
                      onClick={() => handleRowClick(pool)}
                    >
                      <td className="py-2 font-medium">
                        {pool.assetData?.name ??
                          pool.assetMeta?.mint.toString().slice(0, 6) ??
                          "Unknown"}
                      </td>
                      <td className="py-2">
                        <span className="font-mono text-xs">{pool.assetData?.symbol ?? "—"}</span>
                      </td>
                      <td className="py-2">
                        <button
                          className="hover:text-primary text-muted-foreground font-mono text-xs transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigator.clipboard.writeText(pool.pool.mint.toString())
                          }}
                          title="Click to copy"
                        >
                          {formatMintAddress(pool.pool.mint)}
                        </button>
                      </td>
                      <td className="py-2">{pool.price ? formatCurrency(pool.price, 4) : "—"}</td>
                      <td className="py-2">
                        {formatCurrency(pool.totalDeposits * (pool.price ?? 0), 2)}
                      </td>
                      <td className="py-2">
                        <span className="font-semibold text-green-600">
                          {apys.depositApyPercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-2">
                        {formatCurrency(pool.totalBorrows * (pool.price ?? 0), 2)}
                      </td>
                      <td className="py-2">
                        <span className="font-semibold text-orange-600">
                          {apys.borrowApyPercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-2">
                        <span className={cn(pool.utilizationRate > 90 && "text-red-500")}>
                          {pool.utilizationRate.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {!publicKey && (
        <Card className="border-border bg-muted/50 mt-4 border md:m-8">
          <CardContent className="py-4 text-center">
            <p className="text-muted-foreground text-sm">
              Connect your wallet to view personalized market data
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  )
}
