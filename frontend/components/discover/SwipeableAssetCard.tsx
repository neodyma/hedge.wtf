"use client"

import { motion, useMotionValue } from "framer-motion"
import { useState } from "react"
import type { PanInfo } from "framer-motion"

import type { DiscoverAsset } from "@/hooks/useDiscoverAssets"
import { AssetOverlay } from "@/components/discover/AssetOverlay"
import { SwipeIndicator } from "@/components/discover/SwipeIndicator"

const SWIPE_THRESHOLD_HORIZONTAL = 200
const SWIPE_THRESHOLD_VERTICAL = 150

interface SwipeableAssetCardProps {
  asset: DiscoverAsset
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
}

export function SwipeableAssetCard({
  asset,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
}: SwipeableAssetCardProps) {
  const [direction, setDirection] = useState<"left" | "right" | null>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { x: xOffset, y: yOffset } = info.offset
    if (Math.abs(xOffset) > Math.abs(yOffset) && Math.abs(xOffset) > 50) {
      setDirection(xOffset > 0 ? "right" : "left")
    } else {
      setDirection(null)
    }
  }

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const { x: xOffset, y: yOffset } = info.offset

    setDirection(null)

    if (Math.abs(xOffset) > Math.abs(yOffset)) {
      if (xOffset > SWIPE_THRESHOLD_HORIZONTAL) onSwipeRight?.()
      else if (xOffset < -SWIPE_THRESHOLD_HORIZONTAL) onSwipeLeft?.()
    } else {
      if (yOffset < -SWIPE_THRESHOLD_VERTICAL) onSwipeUp?.()
      else if (yOffset > SWIPE_THRESHOLD_VERTICAL) onSwipeDown?.()
    }

    x.set(0)
    y.set(0)
  }

  return (
    <motion.div
      className="relative h-screen w-full touch-none select-none overflow-hidden bg-background"
      style={{ x, y }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
    >
      <AssetOverlay asset={asset} priceChange={asset.priceChange24h} />
      <SwipeIndicator
        direction={direction}
        progress={
          direction
            ? Math.min(Math.abs(x.get()) / SWIPE_THRESHOLD_HORIZONTAL, 1)
            : 0
        }
      />
    </motion.div>
  )
}
