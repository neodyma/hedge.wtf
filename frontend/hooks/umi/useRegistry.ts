"use client"

import { useEffect, useState } from "react"

import type { AssetRegistry } from "@/clients/generated/accounts/assetRegistry"
import type { Market } from "@/clients/generated/accounts/market"

import { createDefaultUmi } from "@/lib/umi"
import { autoLoadMarketAndRegistry } from "@/lib/umi/discovery"

type UseRegistry = {
  assets: AssetRegistry["assets"]
  error: Error | null
  loading: boolean
  market: Market | null
  registry: AssetRegistry | null
}

export function useRegistry(opts?: {
  endpoint?: string
  preferredAuthority?: string
}): UseRegistry {
  const [state, setState] = useState<UseRegistry>({
    assets: [],
    error: null,
    loading: true,
    market: null,
    registry: null,
  })

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setState((s) => ({ ...s, error: null, loading: true }))

        const umi = createDefaultUmi(opts?.endpoint)
        const { market, registry } = await autoLoadMarketAndRegistry(umi)

        if (cancelled) return

        setState({
          assets: registry?.assets ?? [],
          error: null,
          loading: false,
          market,
          registry,
        })
      } catch (e) {
        if (!cancelled) {
          setState((s) => ({ ...s, error: e as Error, loading: false }))
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [opts?.endpoint, opts?.preferredAuthority])

  return state
}
