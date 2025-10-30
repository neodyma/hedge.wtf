import Link from "next/link"

import { useObligationLeaderboard } from "@/hooks/umi/useObligationLeaderboard"
import { cn, formatCurrency } from "@/lib/utils"

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import DataTable, { Column } from "./DataTable"

export default function Leaderboard() {
  const leaderboard = useObligationLeaderboard()

  const cols: Column<{ account: string; portfolio_value: string }>[] = [
    { accessor: (_r, i) => i + 1, className: "w-12", header: "#" },
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

  return (
    <Card className="border-foreground bg-card rounded-xs border-2 shadow lg:col-span-2">
      <CardHeader className="flex items-center justify-between pb-3">
        <CardTitle className="font-semibold tracking-tight">Leaderboard</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {leaderboard.isLoading ? (
          <div className="py-4 text-center">Loading…</div>
        ) : leaderboard.data?.leaderboard?.length ? (
          <DataTable columns={cols} data={leaderboard.data.leaderboard} keyFn={(r) => r.account} />
        ) : (
          <div className="text-muted-foreground py-4 text-center">No data yet.</div>
        )}
      </CardContent>
    </Card>
  )
}
