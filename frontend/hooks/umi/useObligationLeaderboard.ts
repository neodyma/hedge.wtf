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
  totalEntries: number
  page: number
  pageSize: number
  totalPages: number
}

/**
 * Hook for fetching obligation leaderboard with pagination support
 * - Server-side caching is automatic (shared across all users)
 * - Auto-refreshes every 30 seconds for updated values
 * - Uses TanStack Query for client-side caching
 * - Supports pagination via page and pageSize options
 */
export function useObligationLeaderboard(options?: {
  enabled?: boolean
  page?: number
  pageSize?: number
  refetchInterval?: number
}) {
  const { enabled = true, page = 1, pageSize = 100, refetchInterval = 30_000 } = options || {}

  return useQuery({
    enabled,
    queryFn: () => fetchLeaderboard(false, page, pageSize),
    queryKey: ["leaderboard-rpc", page, pageSize],
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
 * Fetch leaderboard data from RPC API with pagination
 */
async function fetchLeaderboard(
  forceRefresh = false,
  page = 1,
  pageSize = 100,
): Promise<LeaderboardResponse> {
  const url = new URL("/api/leaderboard-rpc", window.location.origin)
  if (forceRefresh) {
    url.searchParams.set("force_refresh", "true")
  }
  url.searchParams.set("page", page.toString())
  url.searchParams.set("pageSize", pageSize.toString())

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
