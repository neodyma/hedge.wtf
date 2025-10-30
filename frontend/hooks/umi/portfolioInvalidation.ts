"use client"

import type { QueryClient } from "@tanstack/react-query"

import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

import { qk } from "@/hooks/umi/keys"
import { useProgramId } from "@/providers/UmiContext"

export function invalidatePortfolioQueries(
  client: QueryClient,
  pid: string,
  owner: null | string,
  market?: null | string,
) {
  return invalidatePortfolioQueriesInternal(client, pid, owner, market ?? null)
}

export function usePortfolioRefetch(owner: null | string, market?: null | string) {
  const client = useQueryClient()
  const pid = useProgramId()

  return useCallback(
    () => invalidatePortfolioQueriesInternal(client, pid, owner, market ?? null),
    [client, pid, owner, market],
  )
}

function invalidatePortfolioQueriesInternal(
  client: QueryClient,
  pid: string,
  owner: null | string,
  market: null | string | undefined,
) {
  if (!owner) return Promise.resolve()

  const tasks: Promise<unknown>[] = []

  tasks.push(client.invalidateQueries({ queryKey: qk.walletBalances(pid, owner) }))
  tasks.push(
    client.invalidateQueries({ queryKey: qk.obligationsByOwner(pid, owner, market ?? undefined) }),
  )

  if (market) {
    tasks.push(client.invalidateQueries({ queryKey: qk.poolsByMarket(pid, market) }))
    tasks.push(client.invalidateQueries({ queryKey: qk.priceCacheByMarket(pid, market) }))
  }

  return Promise.all(tasks)
}
