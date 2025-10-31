"use client"

import { motion } from "framer-motion"
import Image from "next/image"

import type { DiscoverAsset } from "@/hooks/useDiscoverAssets"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SelectionIndicatorsProps {
  longTokens: DiscoverAsset[]
  onHedge: () => void
  onRemoveLong: (index: number) => void
  onRemoveShort: (index: number) => void
  shortTokens: DiscoverAsset[]
}

export function SelectionIndicators({
  longTokens,
  onHedge,
  onRemoveLong,
  onRemoveShort,
  shortTokens,
}: SelectionIndicatorsProps) {
  const canHedge = longTokens.length > 0 && shortTokens.length > 0

  const renderSlot = (
    token: DiscoverAsset | undefined,
    index: number,
    remove: (index: number) => void,
  ) => (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "relative h-12 w-12 rounded-full border-2 transition-colors",
        token
          ? "border-primary bg-background shadow-lg"
          : "border-muted-foreground/30 bg-muted/20 border-dashed",
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      key={index}
    >
      {token && (
        <motion.button
          animate={{ scale: 1 }}
          className="relative h-full w-full overflow-hidden rounded-full"
          initial={{ scale: 0 }}
          onClick={() => remove(index)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <Image
            alt={token.assetSymbol}
            className="object-cover"
            fill
            src={`https://s2.coinmarketcap.com/static/img/coins/64x64/${token.cmcId}.png`}
            unoptimized
          />
        </motion.button>
      )}
    </motion.div>
  )

  return (
    <div className="border-border/50 bg-background/95 fixed right-0 bottom-0 left-0 z-30 border-t backdrop-blur-md">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-semibold tracking-wider text-orange-500 uppercase">Short</p>
          <div className="flex gap-2">
            {[0, 1].map((idx) => renderSlot(shortTokens[idx], idx, onRemoveShort))}
          </div>
        </div>

        <motion.div
          whileHover={canHedge ? { scale: 1.05 } : {}}
          whileTap={canHedge ? { scale: 0.95 } : {}}
        >
          <Button
            className={cn(
              "min-w-[120px] font-bold",
              canHedge
                ? "bg-gradient-to-r from-orange-500 to-green-500 text-white hover:from-orange-600 hover:to-green-600"
                : "bg-muted text-muted-foreground",
            )}
            disabled={!canHedge}
            onClick={onHedge}
            size="lg"
          >
            Hedge
          </Button>
        </motion.div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-semibold tracking-wider text-green-500 uppercase">Long</p>
          <div className="flex gap-2">
            {[0, 1].map((idx) => renderSlot(longTokens[idx], idx, onRemoveLong))}
          </div>
        </div>
      </div>
    </div>
  )
}
