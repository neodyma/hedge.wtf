"use client"

import { useEffect, useState } from "react"
import { TrendingDown, TrendingUp } from "lucide-react"
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
import { fetchHistoricalPrices, type HistoricalPricePoint } from "@/lib/cmc"

const chartConfig = {
  price: {
    label: "Price",
    color: "hsl(var(--chart-1))",
  },
} satisfies ChartConfig

interface PriceChartProps {
  cmcId: number
  symbol?: string
  currentPrice?: number
  minimal?: boolean
  className?: string
}

export function PriceChart({ cmcId, symbol, currentPrice, minimal = false, className }: PriceChartProps) {
  const [data, setData] = useState<HistoricalPricePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadHistoricalData() {
      try {
        setLoading(true)
        setError(null)
        const historicalData = await fetchHistoricalPrices(cmcId, 1, "USD", "hourly")
        if (!cancelled) setData(historicalData)
      } catch (err) {
        if (!cancelled) {
          console.error("PriceChart fetch error", err)
          setError(err instanceof Error ? err.message : "Failed to load price data")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadHistoricalData()
    return () => {
      cancelled = true
    }
  }, [cmcId])

  const priceChange =
    data.length >= 2 ? ((data[data.length - 1].price - data[0].price) / data[0].price) * 100 : 0
  const isPositive = priceChange >= 0
  const prices = data.map((point) => point.price)
  const minPrice = prices.length ? Math.min(...prices) : 0
  const maxPrice = prices.length ? Math.max(...prices) : 0
  const yPad = (maxPrice - minPrice || 1) * 0.05
  const domain: [number, number] = [minPrice - yPad, maxPrice + yPad]

  if (minimal && !loading && !error && data.length > 0) {
    const chartColor = isPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"
    const gradientId = isPositive ? "colorPriceMinimalGreen" : "colorPriceMinimalRed"

    return (
      <div className={className}>
        <ChartContainer config={chartConfig} className="h-full w-full">
          <AreaChart
            accessibilityLayer
            data={data}
            margin={{ left: 12, right: 0, top: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.4} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <YAxis
              domain={domain}
              tickLine={false}
              axisLine={false}
              tickMargin={4}
              width={40}
              tick={{ fontSize: 10 }}
              tickFormatter={(value) => {
                if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`
                if (value >= 1) return `$${value.toFixed(0)}`
                if (value >= 0.01) return `$${value.toFixed(2)}`
                return `$${value.toFixed(4)}`
              }}
            />
            <Area
              dataKey="price"
              type="monotone"
              fill={`url(#${gradientId})`}
              stroke={chartColor}
              strokeWidth={1.5}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    )
  }

  if (loading) {
    return (
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 backdrop-blur-sm" />
        <CardHeader>
          <CardTitle>Price Chart</CardTitle>
          <CardDescription>Loading 30-day price history…</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
          Loading chart data…
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="relative overflow-hidden border-destructive/50">
        <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-transparent to-destructive/10 backdrop-blur-sm" />
        <CardHeader>
          <CardTitle>Price Chart</CardTitle>
          <CardDescription>Failed to load price data</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-sm text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-muted/50 via-transparent to-muted backdrop-blur-sm" />
        <CardHeader>
          <CardTitle>Price Chart</CardTitle>
          <CardDescription>No price data available</CardDescription>
        </CardHeader>
        <CardContent className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
          Historical price data is not available for this asset
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-chart-1/10 backdrop-blur-sm" />
      <CardHeader className="relative z-10">
        <CardTitle>Price Chart</CardTitle>
        <CardDescription>
          {symbol ? `${symbol} ` : ""}30-day price history
          {currentPrice && (
            <span className="ml-2 font-semibold text-foreground">
              ${currentPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative z-10">
        <ChartContainer config={chartConfig} className="h-[260px]">
          <AreaChart data={data} margin={{ left: 12, right: 12, top: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              dataKey="timestamp"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(value) => new Date(value).toLocaleTimeString([], { hour: "numeric" })}
            />
            <YAxis
              domain={domain}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value.toFixed(2)}`}
            />
            <ChartTooltip content={<ChartTooltipContent />} cursor={{ strokeDasharray: "3 3" }} />
            <Area
              dataKey="price"
              type="monotone"
              stroke="hsl(var(--chart-1))"
              strokeWidth={1.5}
              fill="url(#colorPrice)"
            />
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
              </linearGradient>
            </defs>
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="relative z-10 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {isPositive ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
          <span className={isPositive ? "text-green-600" : "text-red-600"}>
            {isPositive ? "+" : ""}
            {priceChange.toFixed(2)}% (24h)
          </span>
        </div>
        {currentPrice && <span className="text-muted-foreground">Spot: ${currentPrice.toFixed(2)}</span>}
      </CardFooter>
    </Card>
  )
}
