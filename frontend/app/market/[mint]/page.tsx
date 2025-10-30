"use client"

import { motion } from "framer-motion"
import { ArrowLeft } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useMemo } from "react"

// import { PriceChart } from "@/components/base/PriceChart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  useAutoMarketAndRegistry,
  usePoolsByMarket,
  usePriceCacheByMarket,
} from "@/hooks/umi/queries"
import { useSolanaWallet } from "@/hooks/useSolanaWallet"
import { getAssetByMint } from "@/lib/riskParameterQuery"
import {
  type EnrichedPool,
  enrichPool,
  formatMintAddress,
  getReadablePoolValues,
  q60ToNumber,
} from "@/lib/umi/pool-utils"
import { calculateCurrentApys, getKeyApyPoints } from "@/lib/umi/rate-calculations"
import { cn, formatCurrency } from "@/lib/utils"

export default function PoolDetailPage() {
  const router = useRouter()
  const params = useParams()
  const mintAddress = params.mint as string
  const { address: publicKey } = useSolanaWallet()

  const { data: marketData, isLoading: marketLoading } = useAutoMarketAndRegistry()
  const market = marketData?.market
  const registry = marketData?.registry

  const { data: pools = [], isLoading: poolsLoading } = usePoolsByMarket(market?.publicKey)
  const { data: priceCache, isLoading: pricesLoading } = usePriceCacheByMarket(market?.publicKey)

  const pool = useMemo(
    () => pools.find((p) => p.mint.toString() === mintAddress),
    [pools, mintAddress],
  )

  const enrichedPool: EnrichedPool | null = useMemo(() => {
    if (!pool) return null
    return enrichPool(pool, registry ?? null, priceCache ?? null)
  }, [pool, registry, priceCache])

  const assetData = useMemo(() => {
    if (!mintAddress) return null
    return getAssetByMint(mintAddress)
  }, [mintAddress])

  const isLoading = marketLoading || poolsLoading || pricesLoading

  if (isLoading) {
    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="py-8 text-center">
          <div className="text-muted-foreground">Loading pool data from devnet...</div>
        </div>
      </motion.div>
    )
  }

  if (!pool || !enrichedPool) {
    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Button className="mb-4" onClick={() => router.back()} variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Market
        </Button>
        <Card className="border-border bg-card shadow">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Pool not found for mint: {mintAddress}</p>
          </CardContent>
        </Card>
      </motion.div>
    )
  }

  const lastUpdate = new Date(Number(pool.lastTimestamp) * 1000)
  const readableValues = getReadablePoolValues(pool)

  const utilizationBps = Math.round(enrichedPool.utilizationRate * 100)
  const currentApys = calculateCurrentApys(pool.rate, utilizationBps)
  const keyApyPoints = getKeyApyPoints(pool.rate)

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className="flex items-center justify-between">
        <Button onClick={() => router.back()} variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Market
        </Button>
        {publicKey && (
          <Badge className="font-mono text-xs" variant="outline">
            {publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-4)}
          </Badge>
        )}
      </div>

      {/* Pool Header */}
      <Card className="border-border bg-card shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="font-semibold tracking-tight">
                {assetData ? (
                  <>
                    {assetData.name}
                    <span className="text-muted-foreground ml-2 text-base font-normal">
                      ({assetData.symbol})
                    </span>
                  </>
                ) : (
                  <>
                    Pool Details
                    <span className="text-muted-foreground ml-2 text-base font-normal">
                      {enrichedPool.assetMeta?.mint.toString().slice(0, 8) ?? "Unknown Asset"}
                    </span>
                  </>
                )}
              </CardTitle>
              <CardDescription className="mt-2 space-y-1">
                <div className="font-mono text-xs">
                  <span className="text-muted-foreground">Mint:</span>{" "}
                  <button
                    className="hover:text-primary transition-colors"
                    onClick={() => navigator.clipboard.writeText(pool.mint.toString())}
                    title="Click to copy"
                  >
                    {pool.mint.toString()}
                  </button>
                </div>
                {assetData?.pythfeed && (
                  <div className="font-mono text-xs">
                    <span className="text-muted-foreground">Pyth Feed:</span>{" "}
                    <span className="text-muted-foreground/80">{assetData.pythfeed}</span>
                  </div>
                )}
              </CardDescription>
            </div>
            {enrichedPool.price && (
              <div className="text-right">
                <div className="text-muted-foreground text-sm">Current Price</div>
                <div className="text-2xl font-bold">{formatCurrency(enrichedPool.price, 4)}</div>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Price Chart */}
      {/* {assetData?.cmcId && (
        <PriceChart
          cmcId={assetData.cmcId}
          currentPrice={enrichedPool.price ?? undefined}
          symbol={assetData.symbol}
        />
      )} */}

      <Tabs className="w-full" defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-4 space-y-4" value="overview">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card className="border-border bg-card shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Total Deposits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(enrichedPool.totalDeposits * (enrichedPool.price ?? 0), 2)}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {enrichedPool.totalDeposits.toFixed(4)} tokens
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Total Borrows
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(enrichedPool.totalBorrows * (enrichedPool.price ?? 0), 2)}
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {enrichedPool.totalBorrows.toFixed(4)} tokens
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Utilization Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  className={cn(
                    "text-2xl font-bold",
                    enrichedPool.utilizationRate > 90 && "text-red-500",
                  )}
                >
                  {enrichedPool.utilizationRate.toFixed(2)}%
                </div>
                <p className="text-muted-foreground mt-1 text-xs">Borrows / Deposits</p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Current Deposit APY
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {currentApys.depositApyPercent.toFixed(2)}%
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  At {enrichedPool.utilizationRate.toFixed(1)}% utilization
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Current Borrow APY
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {currentApys.borrowApyPercent.toFixed(2)}%
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  At {enrichedPool.utilizationRate.toFixed(1)}% utilization
                </p>
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-muted-foreground text-sm font-medium">
                  Last Update
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium">{lastUpdate.toLocaleDateString()}</div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {lastUpdate.toLocaleTimeString()}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card shadow">
            <CardHeader>
              <CardTitle className="font-semibold tracking-tight">Interest Rate Model</CardTitle>
              <CardDescription>Configuration for how interest rates are calculated</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <div className="text-muted-foreground text-sm">Base Borrow APY</div>
                    <div className="font-mono text-lg font-medium">
                      {(pool.rate.baseBorrowApyBps / 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Kink Utilization</div>
                    <div className="font-mono text-lg font-medium">
                      {(pool.rate.kinkUtilBps / 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Max Borrow APY</div>
                    <div className="font-mono text-lg font-medium">
                      {(pool.rate.maxBorrowApyBps / 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Slope 1 (Pre-Kink)</div>
                    <div className="font-mono text-lg font-medium">
                      {(pool.rate.slope1Bps / 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Slope 2 (Post-Kink)</div>
                    <div className="font-mono text-lg font-medium">
                      {(pool.rate.slope2Bps / 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-sm">Reserve Factor</div>
                    <div className="font-mono text-lg font-medium">
                      {(pool.rate.reserveFactorBps / 100).toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="border-border bg-muted/50 rounded-lg border p-4">
                  <h4 className="text-muted-foreground mb-3 text-xs font-semibold uppercase">
                    APY at Key Utilization Points
                  </h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <div className="text-muted-foreground text-xs">At 0% Utilization</div>
                      <div className="mt-1 space-y-1">
                        <div className="text-sm font-semibold text-green-600">
                          Deposit: {keyApyPoints.atZeroUtil.deposit.toFixed(2)}%
                        </div>
                        <div className="text-sm font-semibold text-orange-600">
                          Borrow: {keyApyPoints.atZeroUtil.borrow.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">
                        At Kink ({(pool.rate.kinkUtilBps / 100).toFixed(0)}% Utilization)
                      </div>
                      <div className="mt-1 space-y-1">
                        <div className="text-sm font-semibold text-green-600">
                          Deposit: {keyApyPoints.atKink.deposit.toFixed(2)}%
                        </div>
                        <div className="text-sm font-semibold text-orange-600">
                          Borrow: {keyApyPoints.atKink.borrow.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">At 100% Utilization</div>
                      <div className="mt-1 space-y-1">
                        <div className="text-sm font-semibold text-green-600">
                          Deposit: {keyApyPoints.atMaxUtil.deposit.toFixed(2)}%
                        </div>
                        <div className="text-sm font-semibold text-orange-600">
                          Borrow: {keyApyPoints.atMaxUtil.borrow.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="text-muted-foreground mt-4 text-xs">
                    Interest rates are calculated using a kinked interest rate model. Below the
                    kink, rates increase gradually (Slope 1). Above the kink, rates increase more
                    steeply (Slope 2) to incentivize repayments and new deposits.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow">
            <CardHeader>
              <CardTitle className="font-semibold tracking-tight">Risk Parameters</CardTitle>
              <CardDescription>
                {assetData
                  ? `Asset-specific risk parameters for ${assetData.symbol}`
                  : "Default market-wide collateral and liquidation settings"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {market && (
                  <>
                    {assetData?.riskParameters && assetData.riskParameters.length > 0 && (
                      <div className="border-border rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
                        <h4 className="text-muted-foreground mb-3 text-xs font-semibold uppercase">
                          {assetData.symbol} Risk Parameters by Paired Asset
                        </h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-muted-foreground border-border border-b text-left">
                                <th className="pr-4 pb-2">Paired Asset</th>
                                <th className="pr-4 pb-2">LTV</th>
                                <th className="pr-4 pb-2">Liquidation Threshold</th>
                                <th className="pb-2">Liquidation Penalty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assetData.riskParameters.slice(0, 10).map((rp, idx) => (
                                <tr className="border-border border-b" key={idx}>
                                  <td className="py-2 pr-4">{rp.pairedAssetName}</td>
                                  <td className="py-2 pr-4 font-semibold">{rp.ltv}%</td>
                                  <td className="py-2 pr-4 font-semibold">
                                    {rp.liquidationThreshold}%
                                  </td>
                                  <td className="py-2 font-semibold">{rp.liquidationPenalty}%</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {assetData.riskParameters.length > 10 && (
                          <p className="text-muted-foreground mt-3 text-xs">
                            Showing top 10 of {assetData.riskParameters.length} risk pairs
                          </p>
                        )}
                        <p className="text-muted-foreground mt-3 text-xs">
                          These are asset-specific risk parameters from the combined asset data.
                          Each row shows the LTV, liquidation threshold, and liquidation penalty
                          when using {assetData.symbol} as collateral against the paired asset.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {enrichedPool.assetMeta && (
                  <div className="border-border bg-muted/50 rounded-lg border p-4">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Asset Index:</span>{" "}
                      <span className="font-mono">{enrichedPool.assetMeta.index}</span>
                      <br />
                      <span className="text-muted-foreground">Decimals:</span>{" "}
                      <span className="font-mono">{enrichedPool.assetMeta.decimals}</span>
                      <br />
                      <span className="text-muted-foreground">Enabled as Collateral:</span>{" "}
                      <Badge
                        variant={
                          enrichedPool.assetMeta.enabledAsCollateral ? "default" : "secondary"
                        }
                      >
                        {enrichedPool.assetMeta.enabledAsCollateral ? "Yes" : "No"}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-card shadow">
            <CardHeader>
              <CardTitle className="font-semibold tracking-tight">Technical Details</CardTitle>
              <CardDescription>On-chain account information and Q60 values</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                    Account Addresses
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Market:</span>
                      <span className="font-mono">{formatMintAddress(pool.market)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vault:</span>
                      <span className="font-mono">{formatMintAddress(pool.vault)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bump:</span>
                      <span className="font-mono">{pool.bump}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vault Auth Bump:</span>
                      <span className="font-mono">{pool.vaultAuthBump}</span>
                    </div>
                  </div>
                </div>

                <div className="border-border bg-muted/50 rounded-lg border p-4">
                  <h4 className="text-muted-foreground mb-3 text-xs font-semibold uppercase">
                    Q60 Values (Readable - Rounded to 2 decimals)
                  </h4>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-muted-foreground text-xs">Deposit Shares (Q60)</div>
                      <div className="font-mono text-lg font-semibold">
                        {readableValues.depositShares}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Deposit Factor (Q60)</div>
                      <div className="font-mono text-lg font-semibold">
                        {readableValues.depositFactor}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Borrow Shares (Q60)</div>
                      <div className="font-mono text-lg font-semibold">
                        {readableValues.borrowShares}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Borrow Factor (Q60)</div>
                      <div className="font-mono text-lg font-semibold">
                        {readableValues.borrowFactor}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                    Q60 Values (Full Precision)
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deposit Factor (Q60):</span>
                      <span className="font-mono">
                        {q60ToNumber(pool.depositFacQ60).toFixed(6)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Borrow Factor (Q60):</span>
                      <span className="font-mono">{q60ToNumber(pool.borrowFacQ60).toFixed(6)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Deposit Shares (Q60):</span>
                      <span className="font-mono">
                        {q60ToNumber(pool.totalDepositSharesQ60).toFixed(6)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Borrow Shares (Q60):</span>
                      <span className="font-mono">
                        {q60ToNumber(pool.totalBorrowSharesQ60).toFixed(6)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* <TabsContent className="mt-4" value="community">
          <CommunityPosts assetSymbol={assetData?.symbol} cmcId={assetData?.cmcId ?? null} />
        </TabsContent> */}
      </Tabs>
    </motion.div>
  )
}
