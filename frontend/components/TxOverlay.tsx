"use client"

import React, { createContext, useCallback, useContext, useEffect, useState } from "react"

import { Button } from "@/components/ui/button"

const DEFAULT_SOLANA_CLUSTER = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet"

export type TxOverlayInfo = {
  cluster?: string
  label?: string
  signature: string
}

const TxOverlayContext = createContext<((info: TxOverlayInfo) => void) | null>(null)

export function TxOverlayProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<null | TxOverlayInfo>(null)

  useEffect(() => {
    if (!info) return
    const timeout = setTimeout(() => setInfo(null), 8000)
    return () => clearTimeout(timeout)
  }, [info])

  const notify = useCallback((data: TxOverlayInfo) => {
    if (!data.signature) return
    setInfo({
      cluster: data.cluster ?? DEFAULT_SOLANA_CLUSTER,
      label: data.label,
      signature: data.signature,
    })
  }, [])

  const handleExplorerClick = useCallback(() => {
    if (!info) return
    window.open(`https://solscan.io/tx/${info.signature}?cluster=${info.cluster}`, "_blank")
  }, [info])

  return (
    <TxOverlayContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
        {info ? (
          <div className="border-border bg-background/95 pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur">
            <div className="flex-1 text-sm">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                {info.label ?? "Transaction submitted"}
              </p>
              <p className="font-mono">{truncateMiddle(info.signature, 10, 8)}</p>
            </div>
            <Button onClick={handleExplorerClick} size="sm">
              View on Solscan
            </Button>
            <Button
              aria-label="Dismiss transaction overlay"
              onClick={() => setInfo(null)}
              size="icon"
              variant="ghost"
            >
              &times;
            </Button>
          </div>
        ) : null}
      </div>
    </TxOverlayContext.Provider>
  )
}

export function useTxOverlay() {
  const context = useContext(TxOverlayContext)
  if (!context) {
    console.warn("useTxOverlay must be used within TxOverlayProvider")
    return () => {}
  }
  return context
}

function truncateMiddle(s: string, head = 10, tail = 8) {
  if (s.length <= head + tail + 3) return s
  return `${s.slice(0, head)}...${s.slice(-tail)}`
}
