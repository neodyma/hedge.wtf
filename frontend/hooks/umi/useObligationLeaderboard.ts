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
  page: number
  pageSize: number
  scannedAt: number
  totalEntries: number
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
    refetchInterval,
    retry: 2,
    staleTime: 30_000,
  })
}

export function useRefreshLeaderboard() {
  return useQuery({
    enabled: false,
    queryFn: () => fetchLeaderboard(true),
    queryKey: ["leaderboard-rpc-refresh"],
  })
}

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
