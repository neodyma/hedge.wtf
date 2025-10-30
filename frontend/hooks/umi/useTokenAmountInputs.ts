"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

export interface TokenAmountController {
  reset: () => void
  setPercentage: (pct: number) => void
  setTokenInput: (next: string) => void
  setUsdInput: (next: string) => void
  tokenAmount: number
  tokenInput: string
  usdAmount: number
  usdInput: string
}

export interface UseTokenAmountInputOptions {
  autoSelectMax?: boolean
  isDialogOpen?: boolean
  maxAmount?: null | number
  price: number
  resetDeps?: ReadonlyArray<unknown>
}

const parseNumeric = (value: string): number => {
  if (!value) return 0
  const normalized = value.replace(",", ".")
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Shared controller for paired token/USD inputs. Keeps both inputs in sync,
 * applies optional clamping to an available maximum and optionally selects the
 * maximum when a dialog opens for the first time
 */
export function useTokenAmountInputs(options: UseTokenAmountInputOptions): TokenAmountController {
  const [tokenInput, setTokenInputState] = useState("")
  const [usdInput, setUsdInputState] = useState("")

  const clamp = useCallback(
    (value: number) => {
      if (options.maxAmount == null) return Math.max(0, value)
      return Math.max(0, Math.min(options.maxAmount, value))
    },
    [options.maxAmount],
  )

  const setTokenInput = useCallback(
    (next: string) => {
      setTokenInputState(next)

      const amount = clamp(parseNumeric(next))
      if (options.price > 0) {
        setUsdInputState(amount ? (amount * options.price).toString() : "")
      } else {
        setUsdInputState("")
      }
    },
    [clamp, options.price],
  )

  const setUsdInput = useCallback(
    (next: string) => {
      setUsdInputState(next)

      const amount = clamp(parseNumeric(next))
      if (options.price > 0) {
        const tokenAmount = amount / options.price
        setTokenInputState(tokenAmount ? tokenAmount.toString() : "")
      } else {
        setTokenInputState("")
      }
    },
    [clamp, options.price],
  )

  const tokenAmount = useMemo(() => clamp(parseNumeric(tokenInput)), [tokenInput, clamp])
  const usdAmount = useMemo(
    () => (options.price > 0 ? tokenAmount * options.price : clamp(parseNumeric(usdInput))),
    [tokenAmount, options.price, usdInput, clamp],
  )

  const setPercentage = useCallback(
    (pct: number) => {
      const max = options.maxAmount ?? 0
      const value = clamp(max * pct)
      setTokenInput(value ? value.toString() : "")
    },
    [clamp, options.maxAmount, setTokenInput],
  )

  const reset = useCallback(() => {
    setTokenInputState("")
    setUsdInputState("")
  }, [])

  useEffect(() => {
    if (!options.resetDeps) return
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, options.resetDeps)

  useEffect(() => {
    if (!options.autoSelectMax) return
    if (!options.isDialogOpen) return
    if (!options.maxAmount || options.maxAmount <= 0) return
    if (tokenInput) return

    setTokenInput(options.maxAmount.toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.isDialogOpen, options.autoSelectMax, options.maxAmount])

  return {
    reset,
    setPercentage,
    setTokenInput,
    setUsdInput,
    tokenAmount,
    tokenInput,
    usdAmount,
    usdInput,
  }
}
