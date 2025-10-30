import { BN } from "@coral-xyz/anchor"
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount?: number, precision?: number): string {
  if (!amount) return "$0"

  const absAmount = Math.abs(amount)
  let formatted: string

  if (absAmount >= 1e9) {
    formatted = (amount / 1e9).toFixed(precision) + "B"
  } else if (absAmount >= 1e6) {
    formatted = (amount / 1e6).toFixed(precision) + "M"
  } else if (absAmount >= 1e3) {
    formatted = (amount / 1e3).toFixed(precision) + "k"
  } else {
    formatted = amount.toFixed(precision)
  }

  return `$${formatted}`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logMe(...str: any) {
  console.log(new Date().toISOString(), ...str)
}

export function rawToUi(raw: BN, decimals: number): number {
  return raw.div(new BN(10).pow(new BN(decimals))).toNumber()
}

export function uiToRaw(ui: number | string, decimals: number): BN {
  const [whole, frac = ""] = ui.toString().split(".")
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals)
  return new BN(whole + fracPadded)
}
