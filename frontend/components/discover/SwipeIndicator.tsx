"use client"

import { motion } from "framer-motion"
import { ArrowLeft, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

interface SwipeIndicatorProps {
  direction: "left" | "right" | null
  progress: number
}

export function SwipeIndicator({ direction, progress }: SwipeIndicatorProps) {
  if (!direction || progress <= 0) return null

  const isRight = direction === "right"
  const opacity = Math.min(progress * 2, 1)
  const scale = 0.8 + progress * 0.2

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity, scale }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={cn(
        "pointer-events-none absolute top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-2",
        isRight ? "right-12" : "left-12",
      )}
    >
      <motion.div
        animate={{ x: isRight ? [0, 10, 0] : [0, -10, 0] }}
        transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
        className={cn(
          "flex h-16 w-16 items-center justify-center rounded-full border-2 shadow-2xl",
          isRight
            ? "border-green-500 bg-green-500/20 text-green-500"
            : "border-orange-500 bg-orange-500/20 text-orange-500",
        )}
      >
        {isRight ? <ArrowRight className="h-8 w-8" /> : <ArrowLeft className="h-8 w-8" />}
      </motion.div>

      <div
        className={cn(
          "rounded-full px-4 py-2 font-semibold text-white shadow-lg",
          isRight ? "bg-green-500" : "bg-orange-500",
        )}
      >
        {isRight ? "LONG" : "SHORT"}
      </div>
    </motion.div>
  )
}
