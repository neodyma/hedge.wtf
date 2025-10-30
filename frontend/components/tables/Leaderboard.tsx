"use client"

import Link from "next/link"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useObligationLeaderboard } from "@/hooks/umi/useObligationLeaderboard"
import { cn, formatCurrency } from "@/lib/utils"

import DataTable, { Column } from "./DataTable"

const PAGE_SIZE = 100

export default function Leaderboard() {
  const [page, setPage] = useState(1)
  const leaderboard = useObligationLeaderboard({ page, pageSize: PAGE_SIZE })

  const totalEntries = leaderboard.data?.totalEntries ?? 0
  const totalPages = leaderboard.data?.totalPages ?? 0

  // Update column accessor for rank to show global rank
  const cols: Column<{ account: string; portfolio_value: string }>[] = [
    {
      accessor: (_r, i) => (page - 1) * PAGE_SIZE + i + 1,
      className: "w-12",
      header: "#",
    },
    {
      accessor: (r) => {
        const displayAccount =
          r.account.length > 20 ? `${r.account.slice(0, 4)}...${r.account.slice(-4)}` : r.account
        return (
          <Link
            className={cn(
              "hover:text-primary font-mono underline-offset-4 transition-colors hover:underline",
            )}
            href={`/leaderboard/${encodeURIComponent(r.account)}`}
          >
            {displayAccount}
          </Link>
        )
      },
      className: "font-mono",
      header: "Account",
    },
    {
      accessor: (r) => formatCurrency(Number(r.portfolio_value), 2),
      header: "Portfolio (USD)",
    },
  ]

  const handlePrevPage = () => {
    setPage((prev) => Math.max(1, prev - 1))
  }

  const handleNextPage = () => {
    setPage((prev) => Math.min(totalPages, prev + 1))
  }

  const startEntry = (page - 1) * PAGE_SIZE + 1
  const endEntry = Math.min(page * PAGE_SIZE, totalEntries)

  return (
    <Card className="border-foreground bg-card rounded-xs border-2 shadow lg:col-span-2">
      <CardHeader className="flex items-center justify-between pb-3">
        <CardTitle className="font-semibold tracking-tight">Leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {leaderboard.isLoading ? (
          <div className="py-4 text-center">Loading…</div>
        ) : leaderboard.data?.leaderboard?.length ? (
          <>
            <DataTable
              columns={cols}
              data={leaderboard.data.leaderboard}
              keyFn={(r) => r.account}
            />

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t pt-4">
                <div className="text-muted-foreground text-sm">
                  Showing {startEntry}-{endEntry} of {totalEntries} entries
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    disabled={page === 1 || leaderboard.isLoading}
                    onClick={handlePrevPage}
                    size="sm"
                    variant="outline"
                  >
                    Previous
                  </Button>
                  <div className="text-sm">
                    Page {page} of {totalPages}
                  </div>
                  <Button
                    disabled={page === totalPages || leaderboard.isLoading}
                    onClick={handleNextPage}
                    size="sm"
                    variant="outline"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground py-4 text-center">No data yet.</div>
        )}
      </CardContent>
    </Card>
  )
}
