/**
 * React hook for fetching RPC-based leaderboard data
 * Uses TanStack Query for client-side caching and automatic refetching
 * Server-side caching is handled by the API route (shared across all users)
 */

import { useQuery } from "@tanstack/react-query"

export interface LeaderboardEntry {
  account: string
  owner: string
  portfolio_value: string
  totalBorrowsUsd: number
  totalDepositsUsd: number
}

export interface LeaderboardResponse {
  cached: boolean
  leaderboard: LeaderboardEntry[]
  obligationCount: number
  scannedAt: number
}

/**
 * Hook for fetching obligation leaderboard
 * - Server-side caching is automatic (shared across all users)
 * - Auto-refreshes every 30 seconds for updated values
 * - Uses TanStack Query for client-side caching
 */
export function useObligationLeaderboard(options?: {
  enabled?: boolean
  refetchInterval?: number
}) {
  const { enabled = true, refetchInterval = 30_000 } = options || {}

  return useQuery({
    enabled,
    queryFn: () => fetchLeaderboard(false),
    queryKey: ["leaderboard-rpc"],
    refetchInterval, // Auto-refresh every 30 seconds
    retry: 2, // Retry failed requests twice
    staleTime: 30_000, // Consider data stale after 30 seconds
  })
}

/**
 * Hook for manually refreshing the leaderboard (force full scan)
 */
export function useRefreshLeaderboard() {
  return useQuery({
    enabled: false, // Only run when manually triggered
    queryFn: () => fetchLeaderboard(true),
    queryKey: ["leaderboard-rpc-refresh"],
  })
}

/**
 * Fetch leaderboard data from RPC API
 */
async function fetchLeaderboard(forceRefresh = false): Promise<LeaderboardResponse> {
  const url = new URL("/api/leaderboard-rpc", window.location.origin)
  if (forceRefresh) {
    url.searchParams.set("force_refresh", "true")
  }

  const response = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
    },
    method: "GET",
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || "Failed to fetch leaderboard")
  }

  return response.json()
}
