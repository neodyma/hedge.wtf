"use client"

import { Children, type ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn, formatCurrency } from "@/lib/utils"

const CARD_BASE_CLASS =
  "border-foreground bg-card flex min-w-[16rem] flex-none items-stretch rounded-xs border-2 shadow-xs dark:shadow-md lg:flex-auto"

type MetricCardProps = {
  textClassName?: string
  title: string
  value: string
}

export default function MetricsRow({
  borrowWorth,
  children,
  depositWorth,
  dollarWorth,
  healthScore,
  projectedApy,
}: {
  borrowWorth: number
  children?: ReactNode
  depositWorth: number
  dollarWorth?: number
  healthScore: number
  projectedApy?: number
}) {
  const cards: ReactNode[] = [
    <MetricCard
      key="health"
      textClassName={
        healthScore <= 1 ? "text-destructive" : healthScore <= 1.5 ? "text-warning" : undefined
      }
      title="Health Score"
      value={healthScore.toFixed(2)}
    />,
  ]

  if (typeof dollarWorth !== "undefined") {
    cards.push(<MetricCard key="balance" title="Balance" value={formatCurrency(dollarWorth, 2)} />)
  }

  cards.push(
    <MetricCard
      key="depo-borrow"
      title="Deposit / Borrow"
      value={`${formatCurrency(depositWorth, 1)} / ${formatCurrency(borrowWorth, 1)}`}
    />,
  )

  if (typeof projectedApy !== "undefined") {
    cards.push(
      <MetricCard key="apy" title="Projected APY" value={formatCurrency(projectedApy, 2)} />,
    )
  }

  const extraCards = Children.toArray(children).map((child, idx) => (
    <Card className={CARD_BASE_CLASS} key={`extra-${idx}`}>
      <CardContent className="flex items-center justify-center text-center">{child}</CardContent>
    </Card>
  ))

  return (
    <div className="scrollbar-hide mt-4 w-full overflow-x-auto px-16">
      <div className="flex w-max items-stretch gap-4 scroll-smooth lg:w-full lg:flex-nowrap lg:justify-between lg:[&>*]:min-w-0 lg:[&>*]:basis-[calc((100%-3rem)/4)]">
        {cards}
        {extraCards}
      </div>
    </div>
  )
}

function MetricCard({ textClassName, title, value }: MetricCardProps) {
  return (
    <Card className={CARD_BASE_CLASS}>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "text-primary overflow-hidden text-2xl font-semibold text-ellipsis",
            textClassName,
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
