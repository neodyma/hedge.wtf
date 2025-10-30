"use client"

import { motion } from "framer-motion"
import { ArrowLeft } from "lucide-react"
import { useParams, useRouter } from "next/navigation"
import { useMemo } from "react"

import { PriceChart } from "@/components/PriceChart"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent } from "@/components/ui/tabs"
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

const primaryCardClass =
  "rounded-xs border-2 border-foreground bg-card/80 shadow-none backdrop-blur"
const mutedPanelClass = "rounded-xs p-2 bg-background/50"

type InfoStatProps = {
  label: string
  mono?: boolean
  value: string
}

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
      <motion.main
        animate={{ opacity: 1, y: 0 }}
        className="relative flex-1"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16 text-center sm:px-6 lg:px-8">
          <div className="border-foreground/20 bg-background/60 rounded-xs border-2 px-6 py-10">
            <p className="text-muted-foreground">Loading pool data from devnet...</p>
          </div>
        </div>
      </motion.main>
    )
  }

  if (!pool || !enrichedPool) {
    return (
      <motion.main
        animate={{ opacity: 1, y: 0 }}
        className="relative flex-1"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6 lg:px-8">
          <Button onClick={() => router.back()} size="sm" variant="secondary">
            <ArrowLeft className="mr-2 size-4" />
            Back to Market
          </Button>
          <Card className={primaryCardClass}>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">Pool not found for mint: {mintAddress}</p>
            </CardContent>
          </Card>
        </div>
      </motion.main>
    )
  }

  const lastUpdate = new Date(Number(pool.lastTimestamp) * 1000)
  const readableValues = getReadablePoolValues(pool)

  const utilizationBps = Math.round(enrichedPool.utilizationRate * 100)
  const currentApys = calculateCurrentApys(pool.rate, utilizationBps)
  const keyApyPoints = getKeyApyPoints(pool.rate)

  const metricCards = [
    {
      helper: `${enrichedPool.totalDeposits.toFixed(4)} tokens`,
      title: "Total Deposits",
      value: formatCurrency(enrichedPool.totalDeposits * (enrichedPool.price ?? 0), 2),
      valueClass: "text-2xl font-bold",
    },
    {
      helper: `${enrichedPool.totalBorrows.toFixed(4)} tokens`,
      title: "Total Borrows",
      value: formatCurrency(enrichedPool.totalBorrows * (enrichedPool.price ?? 0), 2),
      valueClass: "text-2xl font-bold",
    },
    {
      helper: "Borrows / Deposits",
      title: "Utilization Rate",
      value: `${enrichedPool.utilizationRate.toFixed(2)}%`,
      valueClass: cn(
        "text-2xl font-bold",
        enrichedPool.utilizationRate > 90 ? "text-destructive" : undefined,
      ),
    },
    {
      helper: `At ${enrichedPool.utilizationRate.toFixed(1)}% utilization`,
      title: "Current Deposit APY",
      value: `${currentApys.depositApyPercent.toFixed(2)}%`,
      valueClass: "text-2xl font-semibold text-green-600",
    },
    {
      helper: `At ${enrichedPool.utilizationRate.toFixed(1)}% utilization`,
      title: "Current Borrow APY",
      value: `${currentApys.borrowApyPercent.toFixed(2)}%`,
      valueClass: "text-2xl font-semibold text-orange-600",
    },
    {
      helper: lastUpdate.toLocaleTimeString(),
      title: "Last Update",
      value: lastUpdate.toLocaleDateString(),
      valueClass: "text-sm font-medium",
    },
  ]

  return (
    <motion.main
      animate={{ opacity: 1, y: 0 }}
      className="relative flex-1"
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button onClick={() => router.back()} size="sm" variant="secondary">
            <ArrowLeft className="mr-2 size-4" />
            Back to Market
          </Button>
          {publicKey && (
            <Badge className="font-mono text-xs" variant="outline">
              {publicKey.toString().slice(0, 6)}...{publicKey.toString().slice(-4)}
            </Badge>
          )}
        </header>

        <Card className={primaryCardClass}>
          <CardHeader>
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <CardTitle className="text-3xl font-semibold tracking-tight">
                  {assetData ? (
                    <>
                      {assetData.name}
                      <span className="text-muted-foreground ml-3 text-base font-medium">
                        ({assetData.symbol})
                      </span>
                    </>
                  ) : (
                    <>
                      Pool Details
                      <span className="text-muted-foreground ml-3 text-base font-medium">
                        {enrichedPool.assetMeta?.mint.toString().slice(0, 8) ?? "Unknown Asset"}
                      </span>
                    </>
                  )}
                </CardTitle>
                <CardDescription className="space-y-1 text-sm">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-muted-foreground">Mint:</span>
                    <button
                      className="hover:text-primary transition-colors"
                      onClick={() => navigator.clipboard.writeText(pool.mint.toString())}
                      title="Click to copy"
                    >
                      {`${pool.mint.toString().substring(0, 8)}..${pool.mint.toString().substring(36)}`}
                    </button>
                  </div>
                  {assetData?.pythfeed ? (
                    <div className="text-muted-foreground/80 flex items-center gap-2 font-mono text-xs">
                      <span>Pyth Feed:</span>
                      <span>{`${assetData.pythfeed.substring(0, 10)}..${assetData.pythfeed.substring(54)}`}</span>
                    </div>
                  ) : null}
                </CardDescription>
              </div>
              {enrichedPool.price ? (
                <div className="border-foreground/20 bg-background/60 rounded-xs border-2 px-5 py-4 text-right">
                  <div className="text-muted-foreground text-sm">Current Price</div>
                  <div className="text-3xl font-semibold">
                    {formatCurrency(enrichedPool.price, 4)}
                  </div>
                </div>
              ) : null}
            </div>
          </CardHeader>
        </Card>

        {assetData?.cmcId && (
          <PriceChart
            cmcId={assetData.cmcId}
            currentPrice={enrichedPool.price ?? undefined}
            symbol={assetData.symbol}
          />
        )}

        <Tabs className="w-full" defaultValue="overview">
          {/* <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="community">Community</TabsTrigger>
          </TabsList> */}

          <TabsContent className="mt-6 space-y-6" value="overview">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {metricCards.map((metric) => (
                <Card className={primaryCardClass} key={metric.title}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-muted-foreground text-sm font-medium">
                      {metric.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={metric.valueClass}>{metric.value}</div>
                    <p className="text-muted-foreground mt-1 text-xs">{metric.helper}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className={primaryCardClass}>
              <CardHeader>
                <CardTitle className="font-semibold tracking-tight">Interest Rate Model</CardTitle>
                <CardDescription>
                  Configuration for how interest rates are calculated
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <InfoStat
                      label="Base Borrow APY"
                      value={`${(pool.rate.baseBorrowApyBps / 100).toFixed(2)}%`}
                    />
                    <InfoStat
                      label="Kink Utilization"
                      value={`${(pool.rate.kinkUtilBps / 100).toFixed(2)}%`}
                    />
                    <InfoStat
                      label="Max Borrow APY"
                      value={`${(pool.rate.maxBorrowApyBps / 100).toFixed(2)}%`}
                    />
                    <InfoStat
                      label="Slope 1 (Pre-Kink)"
                      value={`${(pool.rate.slope1Bps / 100).toFixed(2)}%`}
                    />
                    <InfoStat
                      label="Slope 2 (Post-Kink)"
                      value={`${(pool.rate.slope2Bps / 100).toFixed(2)}%`}
                    />
                    <InfoStat
                      label="Reserve Factor"
                      value={`${(pool.rate.reserveFactorBps / 100).toFixed(2)}%`}
                    />
                  </div>

                  <div className={mutedPanelClass}>
                    <h4 className="text-muted-foreground mb-3 text-xs font-semibold uppercase">
                      APY at Key Utilization Points
                    </h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <ApyPoint
                        borrow={keyApyPoints.atZeroUtil.borrow}
                        deposit={keyApyPoints.atZeroUtil.deposit}
                        label="At 0% Utilization"
                      />
                      <ApyPoint
                        borrow={keyApyPoints.atKink.borrow}
                        deposit={keyApyPoints.atKink.deposit}
                        label={`At Kink (${(pool.rate.kinkUtilBps / 100).toFixed(0)}% Utilization)`}
                      />
                      <ApyPoint
                        borrow={keyApyPoints.atMaxUtil.borrow}
                        deposit={keyApyPoints.atMaxUtil.deposit}
                        label="At 100% Utilization"
                      />
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

            <Card className={primaryCardClass}>
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
                  {market && assetData?.riskParameters && assetData.riskParameters.length > 0 ? (
                    <div className={mutedPanelClass}>
                      <h4 className="text-muted-foreground mb-3 text-xs font-semibold uppercase">
                        {assetData.symbol} Risk Parameters by Paired Asset
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px] text-sm">
                          <thead>
                            <tr className="text-muted-foreground border-foreground border-b text-left">
                              <th className="pr-4 pb-2">Paired Asset</th>
                              <th className="pr-4 pb-2">LTV</th>
                              <th className="pr-4 pb-2">Liquidation Threshold</th>
                              <th className="pb-2">Liquidation Penalty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {assetData.riskParameters.slice(0, 10).map((rp, idx) => (
                              <tr className="border-foreground border-b last:border-b-0" key={idx}>
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
                        These are asset-specific risk parameters from the combined asset data. Each
                        row shows the LTV, liquidation threshold, and liquidation penalty when using{" "}
                        {assetData.symbol} as collateral against the paired asset.
                      </p>
                    </div>
                  ) : null}

                  {enrichedPool.assetMeta ? (
                    <div className={mutedPanelClass}>
                      <div className="space-y-1 text-sm">
                        <div>
                          <span className="text-muted-foreground">Asset Index:</span>{" "}
                          <span className="font-mono">{enrichedPool.assetMeta.index}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Decimals:</span>{" "}
                          <span className="font-mono">{enrichedPool.assetMeta.decimals}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Enabled as Collateral:</span>
                          <Badge
                            variant={
                              enrichedPool.assetMeta.enabledAsCollateral ? "default" : "secondary"
                            }
                          >
                            {enrichedPool.assetMeta.enabledAsCollateral ? "Yes" : "No"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className={primaryCardClass}>
              <CardHeader>
                <CardTitle className="font-semibold tracking-tight">Technical Details</CardTitle>
                <CardDescription>On-chain account information and Q60 values</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <section>
                    <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                      Account Addresses
                    </h4>
                    <div className="space-y-2 text-sm">
                      <KeyValue label="Market" value={formatMintAddress(pool.market)} />
                      <KeyValue label="Vault" value={formatMintAddress(pool.vault)} />
                      <KeyValue label="Bump" value={pool.bump.toString()} />
                      <KeyValue label="Vault Auth Bump" value={pool.vaultAuthBump.toString()} />
                    </div>
                  </section>

                  <div className={mutedPanelClass}>
                    <h4 className="text-muted-foreground mb-3 text-xs font-semibold uppercase">
                      Q60 Values (Readable - Rounded to 2 decimals)
                    </h4>
                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoStat
                        label="Deposit Shares (Q60)"
                        mono
                        value={readableValues.depositShares}
                      />
                      <InfoStat
                        label="Deposit Factor (Q60)"
                        mono
                        value={readableValues.depositFactor}
                      />
                      <InfoStat
                        label="Borrow Shares (Q60)"
                        mono
                        value={readableValues.borrowShares}
                      />
                      <InfoStat
                        label="Borrow Factor (Q60)"
                        mono
                        value={readableValues.borrowFactor}
                      />
                    </div>
                  </div>

                  <section>
                    <h4 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                      Q60 Values (Full Precision)
                    </h4>
                    <div className="space-y-2 text-sm">
                      <KeyValue
                        label="Deposit Factor (Q60)"
                        value={q60ToNumber(pool.depositFacQ60).toFixed(6)}
                      />
                      <KeyValue
                        label="Borrow Factor (Q60)"
                        value={q60ToNumber(pool.borrowFacQ60).toFixed(6)}
                      />
                      <KeyValue
                        label="Total Deposit Shares (Q60)"
                        value={q60ToNumber(pool.totalDepositSharesQ60).toFixed(6)}
                      />
                      <KeyValue
                        label="Total Borrow Shares (Q60)"
                        value={q60ToNumber(pool.totalBorrowSharesQ60).toFixed(6)}
                      />
                    </div>
                  </section>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* <TabsContent className="mt-4" value="community">
            <CommunityPosts assetSymbol={assetData?.symbol} cmcId={assetData?.cmcId ?? null} />
          </TabsContent> */}
        </Tabs>
      </div>
    </motion.main>
  )
}

const InfoStat = ({ label, mono = false, value }: InfoStatProps) => (
  <div>
    <div className="text-muted-foreground text-sm">{label}</div>
    <div className={cn("text-lg font-medium", mono ? "font-mono" : undefined)}>{value}</div>
  </div>
)

type ApyPointProps = {
  borrow: number
  deposit: number
  label: string
}

const ApyPoint = ({ borrow, deposit, label }: ApyPointProps) => (
  <div>
    <div className="text-muted-foreground text-xs">{label}</div>
    <div className="mt-1 space-y-1">
      <div className="text-sm font-semibold text-green-600">Deposit: {deposit.toFixed(2)}%</div>
      <div className="text-sm font-semibold text-orange-600">Borrow: {borrow.toFixed(2)}%</div>
    </div>
  </div>
)

type KeyValueProps = {
  label: string
  value: string
}

const KeyValue = ({ label, value }: KeyValueProps) => (
  <div className="flex justify-between">
    <span className="text-muted-foreground">{label}:</span>
    <span className="font-mono">{value}</span>
  </div>
)
