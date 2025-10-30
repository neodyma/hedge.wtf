"use client"

import { TrendingDown, TrendingUp } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { fetchHistoricalPrices, HistoricalPricePoint } from "@/lib/cmc"
import { cn } from "@/lib/utils"

const chartConfig = {
  price: {
    color: "hsl(var(--chart-1))",
    label: "Price",
  },
} satisfies ChartConfig

interface PriceChartProps {
  className?: string
  cmcId: number
  currentPrice?: number
  minimal?: boolean // Render chart only, no card wrapper
  symbol?: string
}

export function PriceChart({
  className,
  cmcId,
  currentPrice,
  minimal = false,
  symbol,
}: PriceChartProps) {
  const [data, setData] = useState<HistoricalPricePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<null | string>(null)

  useEffect(() => {
    async function loadHistoricalData() {
      try {
        setLoading(true)
        setError(null)
        // Fetch 1 day of hourly data (24 hours)
        const historicalData = await fetchHistoricalPrices(cmcId, 1, "USD", "hourly")
        setData(historicalData)
      } catch (err) {
        console.error("Failed to fetch historical prices:", err)
        setError(err instanceof Error ? err.message : "Failed to load price data")
      } finally {
        setLoading(false)
      }
    }

    loadHistoricalData()
  }, [cmcId])

  const derived = useMemo(() => {
    if (!data.length) {
      return {
        isPositive: false,
        lastPrice: currentPrice ?? 0,
        priceChange: 0,
        yDomain: [0, 0] as [number, number],
      }
    }

    const first = data[0].price
    const last = currentPrice ?? data[data.length - 1].price
    const change = first === 0 ? 0 : ((last - first) / first) * 100
    const prices = data.map((d) => d.price)
    const minPrice = Math.min(...prices, last)
    const maxPrice = Math.max(...prices, last)
    const priceRange = maxPrice - minPrice
    const padding = priceRange === 0 ? minPrice * 0.05 : priceRange * 0.05

    return {
      isPositive: change >= 0,
      lastPrice: last,
      priceChange: change,
      yDomain: [minPrice - padding, maxPrice + padding] as [number, number],
    }
  }, [currentPrice, data])

  // Minimal mode: render just the chart for backgrounds
  if (minimal && !loading && !error && data.length > 0) {
    const chartColor = derived.isPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"
    const gradientId = derived.isPositive ? "colorPriceMinimalGreen" : "colorPriceMinimalRed"

    return (
      <div className={className}>
        <ChartContainer className="h-full w-full" config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{
              bottom: 0,
              left: 12,
              right: 0,
              top: 0,
            }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <YAxis
              axisLine={false}
              domain={derived.yDomain}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => {
                if (value >= 1000) {
                  return `$${(value / 1000).toFixed(1)}k`
                } else if (value >= 1) {
                  return `$${value.toFixed(0)}`
                } else if (value >= 0.01) {
                  return `$${value.toFixed(2)}`
                } else {
                  return `$${value.toFixed(4)}`
                }
              }}
              tickLine={false}
              tickMargin={4}
              width={40}
            />
            <Area
              dataKey="price"
              fill={`url(#${gradientId})`}
              fillOpacity={0.8}
              stroke={chartColor}
              strokeWidth={1.5}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      </div>
    )
  }

  const cardClass = cn(
    "rounded-xs border-2 border-foreground bg-card/80 shadow-none backdrop-blur",
    className,
  )

  if (loading || !data.length) {
    return (
      <Card className={cardClass}>
        <CardHeader>
          <CardTitle>Price Chart</CardTitle>
          <CardDescription>{symbol ? `${symbol} ` : ""}24 hour price history</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[240px] items-center justify-center">
          <div className="text-muted-foreground text-sm">
            {loading
              ? "Loading chart data..."
              : "Historical price data is not available for this asset"}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={cn(cardClass, "border-destructive/60 bg-background/50")}>
        <CardHeader>
          <CardTitle>Price Chart</CardTitle>
          <CardDescription>Failed to load price data</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[240px] items-center justify-center">
          <div className="text-destructive px-4 text-center text-sm">{error}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cardClass}>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-xl font-semibold">Price Chart</CardTitle>
            <CardDescription>{symbol ? `${symbol} ` : ""}24 hour price history</CardDescription>
          </div>
          <div className="text-right">
            <div className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
              Last price
            </div>
            <div className="text-2xl font-semibold">
              ${derived.lastPrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </div>
          </div>
        </div>
        <div className="border-foreground/20 bg-background/50 rounded-xs border-2 px-3 py-2 text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-2 font-medium",
              derived.isPositive ? "text-green-600" : "text-red-600",
            )}
          >
            {derived.isPositive ? (
              <TrendingUp className="size-4" />
            ) : (
              <TrendingDown className="size-4" />
            )}
            {derived.isPositive ? "Up" : "Down"} {Math.abs(derived.priceChange).toFixed(2)}% in the
            last 24 hours
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer className="h-[260px] w-full" config={chartConfig}>
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{
              bottom: 16,
              left: 12,
              right: 12,
              top: 16,
            }}
          >
            <defs>
              <linearGradient id="colorPrice" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.8} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid opacity={0.12} stroke="hsl(var(--muted))" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              minTickGap={32}
              tickLine={false}
              tickMargin={8}
            />
            <YAxis
              axisLine={false}
              domain={derived.yDomain}
              tickFormatter={(value) => {
                // Format price based on magnitude
                if (value >= 1000) {
                  return `$${(value / 1000).toFixed(1)}k`
                } else if (value >= 1) {
                  return `$${value.toFixed(0)}`
                } else if (value >= 0.01) {
                  return `$${value.toFixed(2)}`
                } else {
                  return `$${value.toFixed(4)}`
                }
              }}
              tickLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [
                    `$${Number(value).toLocaleString(undefined, {
                      maximumFractionDigits: 6,
                      minimumFractionDigits: 2,
                    })}`,
                    "Price",
                  ]}
                  labelFormatter={(value) => value}
                />
              }
              cursor={false}
            />
            <Area
              dataKey="price"
              fill="url(#colorPrice)"
              fillOpacity={0.6}
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="relative z-10">
        <div className="text-muted-foreground text-xs">
          Last refreshed {new Date().toLocaleTimeString()} · Data sourced from CoinMarketCap
        </div>
      </CardFooter>
    </Card>
  )
}
