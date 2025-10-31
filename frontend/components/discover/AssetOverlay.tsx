"use client"

import Image from "next/image"
import { motion } from "framer-motion"
import { TrendingDown, TrendingUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { formatCurrency, cn } from "@/lib/utils"
import { PriceChart } from "@/components/discover/PriceChart"
import type { DiscoverAsset } from "@/hooks/useDiscoverAssets"

interface AssetOverlayProps {
  asset: DiscoverAsset
  priceChange?: number
}

export function AssetOverlay({ asset, priceChange = 0 }: AssetOverlayProps) {
  const isPositive = priceChange >= 0

  return (
    <div className="relative z-10 flex h-full w-full flex-col">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="h-1/3 space-y-2 p-6"
      >
        <div className="relative h-12 w-12 overflow-hidden rounded-full border-2 border-primary/20 bg-background/80 shadow-lg">
          <Image
            src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${asset.cmcId}.png`}
            alt={asset.assetSymbol}
            fill
            className="object-cover"
            unoptimized
          />
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">{asset.assetName}</h1>
          <p className="text-base font-medium text-muted-foreground">{asset.assetSymbol}</p>
        </div>

        {asset.price && (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold">{formatCurrency(asset.price, 4)}</span>
            {priceChange !== 0 && (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1 text-xs font-semibold",
                  isPositive
                    ? "border-green-500/50 bg-green-500/10 text-green-500"
                    : "border-red-500/50 bg-red-500/10 text-red-500",
                )}
              >
                {isPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(priceChange).toFixed(2)}%
              </Badge>
            )}
          </div>
        )}
      </motion.div>

      <div className="flex h-1/3 items-center justify-center p-6">
        <div className="h-full w-full overflow-hidden rounded-xl border border-border/30 bg-background/20 backdrop-blur-sm">
          <PriceChart cmcId={asset.cmcId} minimal className="h-full w-full" />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="flex h-1/3 items-end p-6"
      >
        <div className="w-full rounded-xl border border-border/50 bg-background/60 p-3 shadow-lg backdrop-blur-lg">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
              <span className="text-xs">📰</span>
            </div>
            <span className="text-xs font-semibold">Market News</span>
          </div>

          {asset.assetData?.news ? (
            <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{asset.assetData.news}</p>
          ) : (
            <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
              {asset.assetSymbol} trades near {formatCurrency(asset.price ?? 0, 2)} with a 24h move of
              {" "}
              {priceChange >= 0 ? "+" : ""}
              {priceChange.toFixed(2)}%. Continue researching before taking a position.
            </p>
          )}

          <div className="flex gap-3 text-xs text-muted-foreground">
            <span>Price: {formatCurrency(asset.price ?? 0, 2)}</span>
            <span>
              24h: {priceChange >= 0 ? "+" : ""}
              {priceChange.toFixed(2)}%
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
